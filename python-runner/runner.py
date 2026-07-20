import json
import os
import queue
import resource
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import redis
except ModuleNotFoundError:
    redis = None

MAX_CODE_BYTES = 200_000
MAX_STDIN_BYTES = 20_000
TIMEOUT_SECONDS = 20
MEMORY_BYTES = int(os.getenv("PYTHON_RUNNER_MEMORY_BYTES", str(1024 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("PYTHON_RUNNER_MAX_CONCURRENCY", "64")))
PROCESS_LIMIT = max(
    32,
    int(os.getenv("PYTHON_RUNNER_PROCESS_LIMIT", str(MAX_CONCURRENCY + 16))),
)
GLOBAL_MAX_CONCURRENCY = max(
    1,
    int(os.getenv("PYTHON_RUNNER_GLOBAL_MAX_CONCURRENCY", str(MAX_CONCURRENCY))),
)
QUEUE_MAX_SIZE = max(1, int(os.getenv("PYTHON_RUNNER_QUEUE_MAX_SIZE", "512")))
MAX_QUEUE_WAIT_SECONDS = max(1, int(os.getenv("PYTHON_RUNNER_MAX_QUEUE_WAIT_SECONDS", "600")))
REDIS_URL = os.getenv("PYTHON_RUNNER_REDIS_URL", "").strip()
REDIS_PREFIX = os.getenv("PYTHON_RUNNER_REDIS_PREFIX", "educhat:python-runner").strip() or "educhat:python-runner"
REDIS_REQUIRED = os.getenv("PYTHON_RUNNER_REDIS_REQUIRED", "false").strip().lower() in {"1", "true", "yes"}
RUNNER_PORT = max(1, int(os.getenv("PYTHON_RUNNER_PORT", "8790")))
STUDENT_PYTHON = os.getenv("PYTHON_RUNNER_STUDENT_PYTHON", sys.executable).strip() or sys.executable
STUDENT_ENV_NAME = os.getenv("PYTHON_RUNNER_STUDENT_ENV_NAME", "本地标准库环境").strip() or "本地标准库环境"
STUDENT_ENV_VERSION = os.getenv("PYTHON_RUNNER_STUDENT_ENV_VERSION", "local-stdlib").strip() or "local-stdlib"
STUDENT_PACKAGES = [
    item.strip()
    for item in os.getenv("PYTHON_RUNNER_STUDENT_PACKAGES", "").split(",")
    if item.strip()
]
LEASE_TTL_MS = (TIMEOUT_SECONDS + 15) * 1000
REDIS_ERROR_TYPES = (redis.RedisError,) if redis is not None else ()

ACQUIRE_CAPACITY_LUA = """
local now = tonumber(ARGV[1])
local expires_at = tonumber(ARGV[2])
local lease_id = ARGV[3]
local capacity = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= capacity then
  return 0
end
redis.call('ZADD', KEYS[1], expires_at, lease_id)
redis.call('PEXPIRE', KEYS[1], ttl)
return 1
"""


def limit_resources():
    limits = [
        (resource.RLIMIT_CPU, TIMEOUT_SECONDS, TIMEOUT_SECONDS + 1),
        (resource.RLIMIT_AS, MEMORY_BYTES, MEMORY_BYTES),
        (resource.RLIMIT_NOFILE, 32, 32),
        (getattr(resource, "RLIMIT_NPROC", None), PROCESS_LIMIT, PROCESS_LIMIT),
    ]
    for resource_type, soft_limit, hard_limit in limits:
        if resource_type is None:
            continue
        try:
            resource.setrlimit(resource_type, (soft_limit, hard_limit))
        except (OSError, ValueError):
            # macOS 不支持部分 Linux 资源限制；仍由超时守护保证本地调试可用。
            continue


class LocalCapacityLimiter:
    """本地调试未配置 Redis 时的显式单实例限流模式。"""

    distributed = False

    def __init__(self, capacity):
        self._semaphore = threading.BoundedSemaphore(capacity)

    def try_acquire(self, _lease_id):
        return self._semaphore.acquire(blocking=False)

    def release(self, _lease_id):
        self._semaphore.release()


class RedisCapacityLimiter:
    """用 Redis ZSET 保存带过期时间的跨 Runner 执行令牌。"""

    distributed = True

    def __init__(self, redis_url, prefix, capacity):
        self._redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
            health_check_interval=10,
        )
        self._key = f"{prefix}:running-leases"
        self._capacity = capacity

    def ping(self):
        self._redis.ping()

    def try_acquire(self, lease_id):
        now_ms = int(time.time() * 1000)
        return bool(self._redis.eval(
            ACQUIRE_CAPACITY_LUA,
            1,
            self._key,
            now_ms,
            now_ms + LEASE_TTL_MS,
            lease_id,
            self._capacity,
            LEASE_TTL_MS * 2,
        ))

    def release(self, lease_id):
        self._redis.zrem(self._key, lease_id)


def create_capacity_limiter():
    if REDIS_URL:
        if redis is None:
            raise RuntimeError(
                "配置了 PYTHON_RUNNER_REDIS_URL，但当前 Python 环境未安装 redis 包。"
            )
        limiter = RedisCapacityLimiter(REDIS_URL, REDIS_PREFIX, GLOBAL_MAX_CONCURRENCY)
        limiter.ping()
        return limiter
    if REDIS_REQUIRED:
        raise RuntimeError("PYTHON_RUNNER_REDIS_REQUIRED=true 时必须配置 PYTHON_RUNNER_REDIS_URL。")
    return LocalCapacityLimiter(MAX_CONCURRENCY)


@dataclass
class ExecutionJob:
    code: str
    stdin: str
    queue_position: int
    enqueued_at: float = field(default_factory=time.monotonic)
    lease_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    completed: threading.Event = field(default_factory=threading.Event)
    result: dict = None
    status_code: int = 200
    cancelled: bool = False


class RunnerScheduler:
    def __init__(self, limiter):
        self._limiter = limiter
        self._queue = queue.Queue(maxsize=QUEUE_MAX_SIZE)
        self._workers = []
        self._metrics_lock = threading.Lock()
        self._active_jobs = 0
        self._completed_jobs = 0
        self._failed_jobs = 0
        self._timed_out_jobs = 0
        for index in range(MAX_CONCURRENCY):
            worker = threading.Thread(
                target=self._work_forever,
                name=f"python-runner-worker-{index + 1}",
                daemon=True,
            )
            worker.start()
            self._workers.append(worker)

    @property
    def distributed(self):
        return self._limiter.distributed

    def submit(self, code, stdin):
        job = ExecutionJob(code=code, stdin=stdin, queue_position=self._queue.qsize() + 1)
        try:
            self._queue.put_nowait(job)
        except queue.Full:
            return None
        return job

    def snapshot(self):
        with self._metrics_lock:
            return {
                "activeJobs": self._active_jobs,
                "queuedJobs": self._queue.qsize(),
                "completedJobs": self._completed_jobs,
                "failedJobs": self._failed_jobs,
                "timedOutJobs": self._timed_out_jobs,
            }

    def _work_forever(self):
        while True:
            job = self._queue.get()
            try:
                if job.cancelled:
                    continue
                self._run_job(job)
            finally:
                job.completed.set()
                self._queue.task_done()

    def _run_job(self, job):
        deadline = time.monotonic() + MAX_QUEUE_WAIT_SECONDS
        acquired = False
        try:
            while time.monotonic() < deadline:
                if job.cancelled:
                    return
                if self._limiter.try_acquire(job.lease_id):
                    acquired = True
                    break
                time.sleep(0.1)
            if not acquired:
                job.status_code = 503
                job.result = {
                    "stdout": "",
                    "stderr": "运行队列等待超时，请稍后重试。",
                    "exitCode": -1,
                    "durationMs": 0,
                    "timedOut": False,
                    "queueWaitMs": round((time.monotonic() - job.enqueued_at) * 1000),
                }
                return
            with self._metrics_lock:
                self._active_jobs += 1
            job.result = execute_python(job.code, job.stdin)
            job.result["queueWaitMs"] = max(
                0,
                round((time.monotonic() - job.enqueued_at) * 1000) - job.result["durationMs"],
            )
        except REDIS_ERROR_TYPES as error:
            job.status_code = 503
            job.result = {
                "stdout": "",
                "stderr": f"全局运行调度不可用：{error}",
                "exitCode": -1,
                "durationMs": 0,
                "timedOut": False,
                "queueWaitMs": round((time.monotonic() - job.enqueued_at) * 1000),
            }
        except Exception as error:
            job.status_code = 500
            job.result = {
                "stdout": "",
                "stderr": f"执行器错误：{error}",
                "exitCode": -1,
                "durationMs": 0,
                "timedOut": False,
                "queueWaitMs": round((time.monotonic() - job.enqueued_at) * 1000),
            }
        finally:
            if acquired:
                with self._metrics_lock:
                    self._active_jobs = max(0, self._active_jobs - 1)
                    self._completed_jobs += 1
                    if job.result and job.result.get("timedOut"):
                        self._timed_out_jobs += 1
                    elif not job.result or int(job.result.get("exitCode", -1)) != 0:
                        self._failed_jobs += 1
                try:
                    self._limiter.release(job.lease_id)
                except REDIS_ERROR_TYPES:
                    # 令牌会在租约到期后自动回收；不在此掩盖已完成任务的真实结果。
                    pass


def execute_python(code, stdin):
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(dir="/tmp") as workdir:
            source_path = os.path.join(workdir, "main.py")
            matplotlib_config_dir = os.path.join(workdir, ".matplotlib")
            os.makedirs(matplotlib_config_dir, exist_ok=True)
            with open(source_path, "w", encoding="utf-8") as source:
                source.write(code)
            completed = subprocess.run(
                [STUDENT_PYTHON, "-I", source_path],
                input=stdin,
                text=True,
                capture_output=True,
                timeout=TIMEOUT_SECONDS,
                cwd=workdir,
                env={
                    "HOME": workdir,
                    "PATH": "/usr/local/bin:/usr/bin:/bin",
                    "PYTHONIOENCODING": "utf-8",
                    "MPLCONFIGDIR": matplotlib_config_dir,
                    "OPENBLAS_NUM_THREADS": "1",
                    "OMP_NUM_THREADS": "1",
                    "MKL_NUM_THREADS": "1",
                    "NUMEXPR_NUM_THREADS": "1",
                },
                preexec_fn=limit_resources,
            )
            return {
                "stdout": completed.stdout[-40_000:],
                "stderr": completed.stderr[-40_000:],
                "exitCode": completed.returncode,
                "durationMs": round((time.monotonic() - started) * 1000),
                "timedOut": False,
            }
    except subprocess.TimeoutExpired as error:
        return {
            "stdout": (error.stdout or "")[-40_000:],
            "stderr": "运行超过 20 秒，已自动终止。",
            "exitCode": -1,
            "durationMs": TIMEOUT_SECONDS * 1000,
            "timedOut": True,
        }


def build_error_result(message):
    return {
        "stdout": "",
        "stderr": message,
        "exitCode": -1,
        "durationMs": 0,
        "timedOut": False,
        "queueWaitMs": 0,
    }


class RunnerHandler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        body = json.dumps({
            "ok": True,
            "maxConcurrency": MAX_CONCURRENCY,
            "globalMaxConcurrency": GLOBAL_MAX_CONCURRENCY,
            "distributed": SCHEDULER.distributed,
            "studentEnvironment": STUDENT_ENV_NAME,
            "environmentVersion": STUDENT_ENV_VERSION,
            "studentPackages": STUDENT_PACKAGES,
            "timeoutSeconds": TIMEOUT_SECONDS,
            "memoryBytes": MEMORY_BYTES,
            "queueMaxSize": QUEUE_MAX_SIZE,
            "processLimit": PROCESS_LIMIT,
            **SCHEDULER.snapshot(),
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/run":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_CODE_BYTES + MAX_STDIN_BYTES + 4096:
                raise ValueError("请求体过大或无效。")
            payload = json.loads(self.rfile.read(length))
            code = str(payload.get("code", ""))[:MAX_CODE_BYTES]
            stdin = str(payload.get("stdin", ""))[:MAX_STDIN_BYTES]
            job = SCHEDULER.submit(code, stdin)
            if job is None:
                self._send_json(429, build_error_result("运行队列已满，请稍后重试。"))
                return
            if not job.completed.wait(MAX_QUEUE_WAIT_SECONDS + TIMEOUT_SECONDS + 10):
                job.cancelled = True
                self._send_json(504, build_error_result("运行任务等待超时，请稍后重试。"))
                return
            self._send_json(job.status_code, job.result or build_error_result("运行任务没有返回结果。"))
        except ValueError as error:
            self._send_json(400, build_error_result(str(error)))
        except json.JSONDecodeError:
            self._send_json(400, build_error_result("请求 JSON 格式无效。"))
        except Exception as error:
            self._send_json(500, build_error_result(f"执行器错误：{error}"))

    def _send_json(self, status_code, result):
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


CAPACITY_LIMITER = create_capacity_limiter()
SCHEDULER = RunnerScheduler(CAPACITY_LIMITER)
print(
    "[python-runner] "
    f"localWorkers={MAX_CONCURRENCY} globalCapacity={GLOBAL_MAX_CONCURRENCY} "
    f"queueLimit={QUEUE_MAX_SIZE} distributed={SCHEDULER.distributed}",
    flush=True,
)
ThreadingHTTPServer(("0.0.0.0", RUNNER_PORT), RunnerHandler).serve_forever()
