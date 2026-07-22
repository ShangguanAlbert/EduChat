# server/modules/chat 协作说明

本文件适用于 `server/modules/chat/` 目录及其子目录。

## 职责范围

- 聊天模块的后端注册入口与依赖裁剪
- 当前仍通过模块层桥接部分历史聊天路由实现

## 修改原则

- `createChatDeps.js` 只做依赖裁剪与模块依赖声明，不堆业务逻辑
- `routes.js` 负责限定聊天模块暴露的路由范围
- 当前 `routes.js` 通过路径过滤接入历史 `chat-and-images` 路由；修改时优先保持过滤边界稳定

## 特别注意

- 不要无意把非聊天接口暴露进聊天模块
- 如果逐步从历史路由迁移能力，优先做小步迁移并保持现有接口兼容
- 涉及聊天流、管理鉴权、附件上传时，要同时检查相关旧路由是否受影响
- 当前公开 Agent B 是固定 `reserved` 占位；不要恢复 MiniMax 对话或 OpenRouter 配置。群聊 `@AI` 不属于普通单聊 Provider 路径，改动时应检查群聊 AI 配置与 worker
