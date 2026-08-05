# 元协坊 · EduChat

一款基于 React + Vite + Express + MongoDB 构建的智能体协作平台，具有智能体单聊、图片生成、音乐生成和智能体协作群聊等功能。

## Docker 部署

1. 准备生产环境变量（不要把真实密钥提交到仓库）：
   - node 版本：20.x
   - `npm install`
   - `cp .env.example .env`
   - 修改 `.env` 中的 API Key、`AUTH_SECRET`、Mongo 账号密码相关变量
   - 如需使用期末测试回退或重新开始功能，请设置 `FINAL_TEST_TURNBACK_PASSPHRASE` 和 `FINAL_TEST_RESTART_PASSPHRASE`
   - 如需挂在子路径下：配置 `EDUCHAT_BASE_PATH`，例如 `EDUCHAT_BASE_PATH=/hznu/metaxfang/`
   - 如需使用 PackyCode：配置 `PACKYCODE_API_KEY`；可选覆盖 `PACKYCODE_CHAT_ENDPOINT`，默认使用 `https://www.packyapi.com/v1/chat/completions`
   - 如需使用 MiniMax 歌词与音乐生成：配置 `MINIMAX_API_KEY`；可选覆盖 `MINIMAX_MUSIC_ENDPOINT` 与 `MINIMAX_LYRICS_ENDPOINT`
   - 如启用文件 OSS 存储：配置 `ALIYUN_OSS_*` 与 `ALIYUN_ACCESS_KEY_*`；公共读桶请设 `ALIYUN_OSS_PUBLIC_READ=true`，私有桶保持 `false`；网络路由建议使用 `ALIYUN_OSS_NETWORK_MODE`：`public`（本地）/`internal_prefer`（ECS 生产）/`internal_only`（严格内网）。`ALIYUN_OSS_INTERNAL` 仍兼容旧配置
   - 默认启用启动自检（Bucket 可达性 + 写删探测），可通过 `ALIYUN_OSS_STARTUP_CHECK_*` 开关调整
   - `docker compose` 会一并启动 `mongo`、`redis`、`app` 与 `group-chat-ai-worker`
   - 容器内群聊 `@AI` 队列固定连接 `redis://redis:6379`，不使用 `.env` 里写给本机调试的 `127.0.0.1`
   - 施高俊授课范围使用 PAIA HTML/CSS 结对编程：每派最多两名学生，以 Driver/Navigator 角色共同编辑网页、刷新沙箱预览并按阶段轮换角色。
   - 网页预览在浏览器受限 iframe 中生成，不在服务端执行学生代码；脚本、表单、嵌入页面和危险 URL 会被禁用。
   - 平台记录发言、代码修改、预览、基础诊断、任务阶段、角色轮换、PAIA 介入和学生纠正等学习过程事件。
2. 启动服务：
   - `docker compose up -d --build`
3. 查看状态：
   - `docker compose ps`
   - `docker compose logs -f app`
   - `docker compose logs -f group-chat-ai-worker`

## 本地部署

1. 安装依赖：
   - `npm install`
2. 配置环境变量：
   - `cp .env.example .env`
   - 至少配置一个 provider 的 API Key；群聊 `@AI` 使用 DashScope 时需设置 `ALIYUN_API_KEY`，PackyCode 单聊需设置 `PACKYCODE_API_KEY`，音乐/歌词生成需设置 `MINIMAX_API_KEY`
   - 如需使用期末测试回退或重新开始功能，请设置 `FINAL_TEST_TURNBACK_PASSPHRASE` 和 `FINAL_TEST_RESTART_PASSPHRASE`
   - 如需本地模拟子路径部署，可额外设置 `EDUCHAT_BASE_PATH=/hznu/metaxfang/`
   - 本地调试群聊 `@AI` 时，建议单独启动 Mongo 和 Redis，再用 `npm run dev`
   - HTML/CSS 预览完全在浏览器中完成，本地开发不需要额外代码执行器。
   - 本地默认 Redis 地址可直接使用 `.env` 里的 `GROUP_CHAT_AI_REDIS_URL=redis://127.0.0.1:6380`
   - 如同时部署了 Dify 等也占用宿主机 `6379` 的服务，EduChat 的 Docker Redis 默认映射到宿主机 `6380`
3. 启动服务：
   - `npm run dev`
   - 该命令会同时启动后端、前端和群聊 `@AI` worker

## 固定公开 Agent

- `Agent A (GPT-5.4)` → `packycode / gpt-5.4`
- `Agent B (预留)` → 暂不提供对话，保留后续 Provider 接入位置
- `Agent C (Distance Education)` → `volcengine / doubao-seed-2-0-pro-260215`
- `Agent D (Qwen)` → `aliyun / qwen3.7-plus`
- 新建聊天时必须先选择 agent；选定后会在整个会话生命周期内锁定，不支持会话中途切换

## 群聊 `@AI`

- 群聊里的 `@AI` 默认走 `aliyun / qwen3.7-plus`（DashScope 协议）；学生不能自行选择模型
- 教师可在“系统设置 → 群聊 AI 配置”中调整模型与苏格拉底式教学提示词；运行时配置保存在 MongoDB，不写入 `.env`
- 启用群聊 `@AI` 需配置 `ALIYUN_API_KEY`（或兼容别名 `DASHSCOPE_API_KEY`）
- 群聊 `@AI` 采用 `Web 服务 + Redis 队列 + 独立 worker` 架构
- 启用前请在 `.env` 中配置：
  - `GROUP_CHAT_AI_REDIS_URL`
  - 可选 `GROUP_CHAT_AI_REDIS_PREFIX`
- 本地联调启动顺序建议：
  - 先启动 Mongo
  - 再启动 Redis
  - `npm run dev`
- `npm run dev` 默认会连带启动群聊 `@AI` worker，不需要再额外执行 `npm run worker:group-chat-ai`
- 服务器 Docker 部署直接使用：
  - `docker compose up -d --build`
- Docker 容器内部 Redis 仍固定为 `redis://redis:6379`；只有宿主机调试入口改为 `127.0.0.1:6380`

## PackyCode Provider

- `provider` 使用 `packycode`
- 默认模型为 `gpt-5.4`
- 默认推理强度为 `medium`
- 当前仅接入标准 OpenAI 兼容 `chat/completions`
- 当前不支持联网搜索、Responses API 与 Packy 专属扩展能力

## MiniMax 音乐与歌词生成

- 音乐与歌词生成直接走 MiniMax 原生 HTTP 接口，不依赖 `Anthropic SDK`
- 音乐生成使用 `MINIMAX_MUSIC_ENDPOINT`，缺省值为 `https://api.minimaxi.com/v1/music_generation`
- 歌词生成使用 `MINIMAX_LYRICS_ENDPOINT`，缺省值为 `https://api.minimaxi.com/v1/lyrics_generation`
- 音乐结果会由服务端抓取并持久化到平台历史，不直接依赖上游的 24 小时临时 URL

## Music Generation

- 入口位于主聊天侧边栏 `Music Generation`
- 单页内提供 `歌词工作台` 与 `音乐工作台` 两个标签
- 歌词工作台支持独立歌词生成与编辑/续写，并保存 `songTitle`、`styleTags` 与歌词历史
- 音乐工作台支持 `music-2.6`、`music-2.6-free`、`music-cover`、`music-cover-free`
- 作曲模型支持 `prompt`、`lyrics`、`isInstrumental`、`lyricsOptimizer`
- 翻唱模型支持本地参考音频上传；服务端会先把参考音频备份到 OSS，再同步等待 MiniMax 返回最终音频
- 页面生成中会锁定关键输入，并在刷新、关闭标签页或离开 `Music Generation` 页面时弹出二次确认
- 当前不提供参考音频下载入口，也未开放输出格式、采样率、码率配置 UI

## 许可证

本项目采用 GNU Affero General Public License v3.0（AGPL-3.0）许可证发布，详见 [LICENSE](./LICENSE) 文件。
