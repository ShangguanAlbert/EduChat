# 元协坊 · EduChat

一款基于 React + Vite + Express + MongoDB 构建的智能体协作平台，具有智能体单聊、图片生成和多智能体协作群聊（正在开发中）等功能。

## Docker 部署

1. 准备生产环境变量（不要把真实密钥提交到仓库）：
   - node 版本：20.x
   - - `npm install`
   - `cp .env.example .env`
   - 修改 `.env` 中的 API Key、`AUTH_SECRET`、Mongo 账号密码相关变量
   - 如启用文件 OSS 存储：配置 `ALIYUN_OSS_*` 与 `ALIYUN_ACCESS_KEY_*`；公共读桶请设 `ALIYUN_OSS_PUBLIC_READ=true`，私有桶保持 `false`；网络路由建议使用 `ALIYUN_OSS_NETWORK_MODE`：`public`（本地）/`internal_prefer`（ECS 生产）/`internal_only`（严格内网）。`ALIYUN_OSS_INTERNAL` 仍兼容旧配置
   - 默认启用启动自检（Bucket 可达性 + 写删探测），可通过 `ALIYUN_OSS_STARTUP_CHECK_*` 开关调整
2. 启动服务：
   - `docker compose up -d --build`
3. 查看状态：
   - `docker compose ps`
   - `docker compose logs -f app`

## 本地部署

1. 安装依赖：
   - `npm install`
2. 启动服务：
   - `npm run dev`
