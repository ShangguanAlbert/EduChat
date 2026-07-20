import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { fetchAdminPartyCodingQuality } from "../../../pages/admin/adminApi.js";

const TIME_WINDOWS = [
  { value: 1, label: "近 1 小时" },
  { value: 24, label: "近 24 小时" },
  { value: 168, label: "近 7 天" },
];

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(value) {
  const ms = Math.max(0, Number(value) || 0);
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} 秒`;
}

function formatMemory(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (!value) return "--";
  return `${Math.round(value / 1024 / 1024)} MB`;
}

function statusMeta(status) {
  const table = {
    succeeded: { label: "运行成功", className: "success" },
    timed_out: { label: "运行超时", className: "warning" },
    queue_full: { label: "队列已满", className: "warning" },
    scheduler_unavailable: { label: "调度不可用", className: "danger" },
    runner_unavailable: { label: "执行器不可用", className: "danger" },
    failed: { label: "运行失败", className: "danger" },
  };
  return table[status] || table.failed;
}

function MetricCard({ label, value, note, tone = "default" }) {
  return <article className={`teacher-python-quality-metric ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

export default function PythonQualityPanel({ adminToken, onError }) {
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError("");
    try {
      const next = await fetchAdminPartyCodingQuality(adminToken, { hours, limit: 50 });
      setData(next);
    } catch (rawError) {
      const message = rawError?.message || "读取 Python 质控数据失败。";
      setError(message);
      onError?.(rawError);
    } finally {
      setLoading(false);
    }
  }, [adminToken, hours, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary || {};
  const runner = data?.runner || {};
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  const packageText = useMemo(
    () => (Array.isArray(runner.studentPackages) && runner.studentPackages.length
      ? runner.studentPackages.join(" · ")
      : "标准库"),
    [runner.studentPackages],
  );

  return <div className="teacher-panel-stack teacher-python-quality-stack">
    <header className="teacher-panel-head">
      <div>
        <h2>Python 环境质控</h2>
        <p>{`施高俊 · 协作编程环境 · 最近采样：${formatDateTime(data?.generatedAt)}`}</p>
      </div>
      <div className="teacher-panel-actions teacher-python-quality-actions">
        <div className="teacher-python-quality-windows" aria-label="统计时间范围">
          {TIME_WINDOWS.map((item) => <button
            type="button"
            key={item.value}
            className={hours === item.value ? "active" : ""}
            onClick={() => setHours(item.value)}
            disabled={loading}
          >{item.label}</button>)}
        </div>
        <button
          type="button"
          className="teacher-ghost-btn teacher-tooltip-btn teacher-action-icon-btn"
          onClick={() => void load()}
          disabled={loading}
          data-tooltip={loading ? "刷新中..." : "刷新质控数据"}
          title={loading ? "刷新中..." : "刷新质控数据"}
          aria-label={loading ? "刷新中..." : "刷新质控数据"}
        >
          <RefreshCw size={15} className={loading ? "is-spinning" : ""} />
        </button>
      </div>
    </header>

    {error ? <div className="teacher-home-alert error">{error}</div> : null}

    <section className="teacher-python-quality-health-grid" aria-label="执行器状态">
      <article className={`teacher-card teacher-python-quality-health${runner.available ? " healthy" : " unavailable"}`}>
        <div className="teacher-python-quality-health-title">
          {runner.available ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
          <div>
            <strong>{runner.available ? "执行器在线" : "执行器不可用"}</strong>
            <span>{runner.available ? "可接受新的 Python 编译任务" : (runner.error || "尚未取得健康状态")}</span>
          </div>
        </div>
        <div className="teacher-python-quality-health-values">
          <span><Activity size={14} />{`执行中 ${Number(runner.activeJobs) || 0}`}</span>
          <span><Clock3 size={14} />{`排队 ${Number(runner.queuedJobs) || 0}`}</span>
          <span><Cpu size={14} />{`${Number(runner.globalMaxConcurrency) || 0} 全局并发`}</span>
        </div>
      </article>
      <article className="teacher-card teacher-python-quality-environment">
        <div className="teacher-python-quality-health-title">
          <Database size={18} />
          <div>
            <strong>{runner.studentEnvironment || "未声明环境"}</strong>
            <span>{`版本：${runner.environmentVersion || "未声明版本"}`}</span>
          </div>
        </div>
        <p>{packageText}</p>
        <div className="teacher-python-quality-policy"><ShieldCheck size={14} />{`单次 ${Number(runner.timeoutSeconds) || 20} 秒 · ${formatMemory(runner.memoryBytes)} · 进程上限 ${Number(runner.processLimit) || "--"}`}</div>
      </article>
    </section>

    <section className="teacher-python-quality-metric-grid" aria-label="运行指标">
      <MetricCard label="运行次数" value={Number(summary.totalRuns) || 0} note={`${hours} 小时内`} />
      <MetricCard label="成功率" value={`${Number(summary.successRate) || 0}%`} note={`${Number(summary.succeededRuns) || 0} 次成功`} tone="success" />
      <MetricCard label="平均耗时" value={formatDuration(summary.averageDurationMs)} note={`P95 ${formatDuration(summary.p95DurationMs)}`} />
      <MetricCard label="平均排队" value={formatDuration(summary.averageQueueWaitMs)} note={`当前派运行中 ${Number(data?.activePartyRuns) || 0} 个`} />
      <MetricCard label="异常运行" value={Number(summary.failedRuns) || 0} note={`超时 ${Number(summary.timedOutRuns) || 0} · 队列满 ${Number(summary.queueFullRuns) || 0}`} tone={Number(summary.failedRuns) ? "warning" : "default"} />
    </section>

    <section className="teacher-python-quality-content-grid">
      <article className="teacher-card teacher-python-quality-log-card">
        <div className="teacher-python-quality-card-head">
          <div>
            <h3>最近运行审计</h3>
            <p>{`仅保留质量元数据，${Number(data?.retentionDays) || 30} 天后自动清理。`}</p>
          </div>
          <span>{`${logs.length} 条`}</span>
        </div>
        {loading && !data ? <p className="teacher-empty-text">正在读取运行审计…</p> : null}
        {!loading && logs.length === 0 ? <p className="teacher-empty-text">当前时间范围内还没有运行记录。</p> : null}
        {logs.length ? <div className="teacher-python-quality-table-wrap"><table className="teacher-python-quality-table">
          <thead><tr><th>时间</th><th>派 / 成员</th><th>结果</th><th>耗时</th><th>排队</th><th>错误摘要</th></tr></thead>
          <tbody>{logs.map((log) => {
            const meta = statusMeta(log.status);
            return <tr key={log.id}>
              <td>{formatDateTime(log.startedAt)}</td>
              <td><strong>{log.roomName}</strong><small>{log.startedByName}</small></td>
              <td><span className={`teacher-python-quality-status ${meta.className}`}>{log.status === "succeeded" ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{meta.label}</span></td>
              <td>{formatDuration(log.durationMs)}</td>
              <td>{formatDuration(log.queueWaitMs)}</td>
              <td className="teacher-python-quality-error">{log.errorSummary || "--"}</td>
            </tr>;
          })}</tbody>
        </table></div> : null}
      </article>
      <article className="teacher-card teacher-python-quality-errors-card">
        <div className="teacher-python-quality-card-head"><div><h3>高频异常</h3><p>用于发现教学任务或环境配置问题。</p></div></div>
        {Array.isArray(summary.frequentErrors) && summary.frequentErrors.length ? <ol className="teacher-python-quality-error-list">{summary.frequentErrors.map((item) => <li key={item.message}><span>{item.message}</span><b>{`${item.count} 次`}</b></li>)}</ol> : <p className="teacher-empty-text">当前没有可归类的异常。</p>}
        <div className="teacher-python-quality-guardrail">
          <ShieldCheck size={16} />
          <p><strong>发布保护</strong>库的新增需走镜像版本发布流程；此面板不提供服务器命令、Docker 操作或任意 pip 安装入口。</p>
        </div>
      </article>
    </section>
  </div>;
}
