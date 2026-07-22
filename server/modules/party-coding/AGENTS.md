# server/modules/party-coding 协作说明

本文件适用于 `server/modules/party-coding/` 目录及其子目录。

## 职责范围

- 派内 Python 代码、标准输入、运行状态和控制台结果的 HTTP/实时同步
- Python Runner 请求转发、单派单任务互斥、运行审计和教师环境质控接口

## 不可变约束

- 学生代码只能由 `PYTHON_RUNNER_URL` 指向的受限 Runner 执行；不得在 Express worker 中执行
- Redis 全局容量与每派单任务语义必须同时保留；单次运行上限为 20 秒
- 全派可编辑和运行；仅派主可恢复版本。实时同步要按 `roomId` 严格隔离
- 运行审计仅保存代码指纹、长度、耗时、队列等待和错误摘要；不得保存完整代码、标准输入或附件内容

## 变更与验证

- 改动路由、`realtime.js` 或 `quality-routes.js` 时，检查前端 `PythonCollabPanel`、WebSocket 事件和 `tests/server/` 相关用例
- 修改并发、内存、PID、队列参数时同步更新 `.env.example`、README 和 Docker Compose；不得在学生代码中开放 `pip install`
