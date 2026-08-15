# chat feature 协作说明

本文件适用于 `src/features/chat/` 目录及其子目录。

## 职责范围

- 普通单聊功能前端入口
- 当前已拆分为：
  - `routes.js`
  - `pages/`
  - `api/`
  - `services/`

## 目录边界

- `api/` 负责 HTTP / SSE 请求封装、鉴权 header 组装、响应读取
- `services/` 负责会话、草稿、标题、附件准备、消息转换等前端业务逻辑
- `pages/` 负责页面编排和视图层连接

## 修改原则

- 新接口请求优先补在 `api/chatApi.js`
- 可复用业务规则优先放到 `services/`，不要把复杂逻辑直接塞进页面组件
- 与服务端共享的字段规范、sessionId 清洗、bootstrap 结构归一化，优先复用 `shared/contracts/chat.js`
- 兼容当前聊天历史、流式输出、附件上传和会话标题生成逻辑，不要只修一个入口却破坏其它链路

## 特别注意

- 流式响应走 SSE；修改流式处理时，要兼顾错误读取和中断处理
- 附件能力较多，变更时注意区分：
  - 本地文件
  - 预处理附件
  - 预览暂存附件
  - 第三方 file refs
- 历史代码仍有一部分依赖 `src/pages/chat/` 中的工具；若重构，优先渐进迁移，不做一次性大搬家
- 当前普通单聊 Agent A/C 使用火山引擎，Agent B 为预留占位；群聊 `@AI` 使用独立的 DashScope 配置与 worker，不要把两条运行链路混合
