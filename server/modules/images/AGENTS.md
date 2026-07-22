# server/modules/images 协作说明

本文件适用于 `server/modules/images/` 目录及其子目录。

## 职责范围

- 图片生成与图片历史的后端模块
- 当前结构包括：
  - `createImageDeps.js`
  - `routes.js`
  - `services/`

## 目录边界

- `createImageDeps.js` 负责显式列出模块依赖
- `routes.js` 负责组合注册流式生成与历史记录相关路由
- `services/history.js` 负责历史记录读写与内容读取
- `services/stream.js` 负责流式生成入口

## 修改原则

- 历史记录接口返回结构必须与 `shared/contracts/images.js` 保持一致
- 涉及图片 URL、OSS key、二进制数据和 data URL 的处理时，优先延续当前“先规范化、再输出”的流程
- 鉴权逻辑继续使用显式中间件，不要在 handler 内外重复实现两套校验

## 特别注意

- 删除或清空历史时，要同时考虑 OSS 对象清理结果
- 读取图片内容时，要兼顾：
  - OSS 跳转
  - 数据库存储的二进制内容
  - data URL 回退
- 修改流式生成入口时，注意上传文件上限、中间件顺序和 SSE 输出稳定性
- 火山引擎图片生成与 OSS 访问凭据均从环境变量读取；不要将密钥、Endpoint 或 Bucket 信息回写到响应、日志或测试快照
