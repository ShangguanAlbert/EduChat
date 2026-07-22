# image-generation feature 协作说明

本文件适用于 `src/features/image-generation/` 目录及其子目录。

## 职责范围

- 图片生成功能前端入口
- 当前包含：
  - `routes.js`
  - `pages/`
  - `api/`

## 修改原则

- 图片生成相关请求统一放在 `api/imageApi.js`
- 历史记录、删除、清空、SSE 事件解析要与 `shared/contracts/images.js` 保持一致
- 页面层负责交互与状态编排，不要把 SSE 解析和请求细节散落到多个组件里

## 特别注意

- 该 feature 同时处理：
  - 生成请求
  - 历史记录
  - 图片流式回传
- 变更字段时，要同步确认服务端 `server/modules/images/` 是否需要配套调整
- 火山引擎图片生成属于独立 Provider 链路；不要将其配置与 DashScope 群聊 AI 或 MiniMax 音乐生成混用
