# server 目录协作说明

本文件适用于 `server/` 目录及其子目录。

## 目录职责

- 本目录承载 Express 服务端实现、领域模块、运行时能力、模型提供商适配与启动装配
- 服务统一入口为 `server/index.js`
- 当前还装配 Python 协作编程模块、群聊 AI Redis worker、音乐模块和 DashScope 群聊 AI 配置

## 架构优先级

- 新能力优先放在对应领域模块中，例如：
  - `server/modules/chat/`
  - `server/modules/images/`
- 应优先延续“创建依赖 + 注册路由”的装配方式，而不是继续堆积到单体路由文件
- `server/routes/` 中已有历史实现时，修改前先确认是否已有对应的模块化替代路径
- `server/index.js` 负责装配，不要把大量业务细节直接塞回入口文件

## 编码约定

- 使用 `ESM`
- 优先拆分纯函数、依赖工厂和路由注册函数，避免超大文件
- 路由层负责：
  - 参数读取与基础校验
  - 调用服务
  - 返回 HTTP 响应
- 业务规则、第三方调用、持久化细节应尽量放到 service / module / provider 层

## 路由与兼容性

- API 路径与静态路径要兼容当前基础路径机制，不要假设部署固定在 `/`
- 变更 API 响应结构时，优先检查 `shared/contracts/` 与前端调用方是否需要同步
- 新接口命名、返回字段和错误格式应保持稳定，避免无必要破坏兼容

## 外部依赖与副作用

- 涉及 MongoDB、OSS、LLM provider、WebSocket 的改动，要保证：
  - 失败时可观测
  - 错误信息可定位
  - 不泄漏敏感信息
- 不要把密钥、token、bucket 信息写死到代码中
- 启动期逻辑应尽量可失败可报告，不要静默吞错
- 群聊 AI 默认是阿里云 DashScope / Qwen，教师后台配置保存在 MongoDB；不要恢复 OpenRouter 或 MiniMax 对话链路
- Python 执行必须交给 `python-runner/`，由 Redis 协调全局容量；服务端不得直接在 Express 进程中执行学生代码

## 修改建议

- 改 provider 逻辑时，同时检查：
  - `server/providers/`
  - `server/platform/llm/`
  - `shared/` 中是否有共用契约
- 改 notes、group chat、auth 等能力时，优先沿着对应子目录继续拆分，不做横向耦合扩散
- 涉及派协作时同步检查 `server/modules/party-coding/`、群聊 WebSocket 事件、运行审计和教师质控接口
- 未经明确要求，不要新增全局单例、隐式状态或跨模块循环依赖
