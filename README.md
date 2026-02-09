# EduChat 平台

使用 React + Vite + Express + MongoDB 构建，支持对话、文件上传和聊天记录持久化。

## Docker 部署

1. 准备生产环境变量（不要把真实密钥提交到仓库）：
   - `cp .env.example .env`
   - 修改 `.env` 中的 API Key、`AUTH_SECRET`、Mongo 账号密码相关变量
2. 启动服务：
   - `docker compose up -d --build`
3. 查看状态：
   - `docker compose ps`
   - `docker compose logs -f app`

默认端口：
- Web + API: `http://服务器IP:8787`
- MongoDB: `127.0.0.1:27017`（仅服务器本机可访问）
