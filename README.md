# 元协坊 · EduChat

一款基于 React + Vite + Express + MongoDB 构建的协作编程平台，聚焦结对编程小教室、过程感知、群聊学习支持与纵向学习记忆。

## Docker 部署

1. 准备生产环境变量（不要把真实密钥提交到仓库）：
   - node 版本：20.x
   - `npm install`
   - `cp .env.example .env`
   - 修改 `.env` 中的 API Key、`AUTH_SECRET`、Mongo 账号密码相关变量
   - 如需使用期末测试回退或重新开始功能，请设置 `FINAL_TEST_TURNBACK_PASSPHRASE` 和 `FINAL_TEST_RESTART_PASSPHRASE`
   - 如需挂在子路径下：配置 `EDUCHAT_BASE_PATH`，例如 `EDUCHAT_BASE_PATH=/hznu/metaxfang/`
   - 如启用文件 OSS 存储：配置 `ALIYUN_OSS_*` 与 `ALIYUN_ACCESS_KEY_*`；公共读桶请设 `ALIYUN_OSS_PUBLIC_READ=true`，私有桶保持 `false`；网络路由建议使用 `ALIYUN_OSS_NETWORK_MODE`：`public`（本地）/`internal_prefer`（ECS 生产）/`internal_only`（严格内网）。`ALIYUN_OSS_INTERNAL` 仍兼容旧配置
   - 默认启用启动自检（Bucket 可达性 + 写删探测），可通过 `ALIYUN_OSS_STARTUP_CHECK_*` 开关调整
   - `docker compose` 会一并启动 `mongo`、`redis`、`app` 与 `group-chat-ai-worker`
   - 容器内群聊 `@AI` 队列固定连接 `redis://redis:6379`，不使用 `.env` 里写给本机调试的 `127.0.0.1`
   - 施高俊授课范围使用 PAIA HTML/CSS 结对编程：教师在后台“结对编程”中从系统学生账号里选择两人创建独立小教室；小教室不进入普通群聊管理，两名学生以 Driver/Navigator 角色共同编辑网页、刷新沙箱预览并按阶段轮换角色。
   - 每个结对编程小教室提供“进入观察”入口。教师以第三方只读身份实时查看两名学生与琳琳的讨论、HTML/CSS、任务阶段和沙箱预览；旁观连接不计入小教室成员，也不能发言、编辑代码、切换阶段或提交学生反馈。
   - `PAIR_PROGRAMMING_INVITE_CODE` 只用于学生自助“加入课堂”时的准入校验；已由教师创建、导入并绑定课堂范围的学生，日常仅使用账号（或学号）和密码登录。服务端从账号绑定关系签发课堂范围与结对编程准入凭证，未绑定或普通课堂账号不能读取、订阅或操作结对编程小教室。
   - 注册区分学生与教师：学生自助注册后进入“待教师确认”；教师注册必须提交独立的 `TEACHER_REGISTRATION_INVITE_CODE`。平台管理员按教师账号配置授权班级，教师只能查看、单独创建或批量导入自己授权班级的学生。
   - “学生与账号”提供 Excel 批量导入：先选择教师并下载带授权班级说明的模板，再上传 `.xlsx` / `.xls` 文件。学号作为登录账号，密码留空时会生成一次性初始密码；导入结果应立即下载保存。
   - 网页预览在浏览器受限 iframe 中生成，不在服务端执行学生代码；脚本、表单、嵌入页面和危险 URL 会被禁用。
   - 平台记录发言、代码修改、预览、基础诊断、任务阶段、角色轮换、PAIA 介入和学生纠正等学习过程事件。
   - 教师端“结对编程”管理中的 AI 参与度主动感知默认关闭。课堂总开关开启后会同步启用全部现有小教室，之后新建的小教室也会自动启用；后台 worker 会按小教室分析开启后最近五分钟的学生对话，校验结构化参与度结果，并仅在参与明显失衡时由琳琳主动发消息。
   - 结对编程采用房间级纵向记忆：同一 `roomId` 固定关联两名长期搭档，教师发布的新群公告会递增 `taskRevision` 以区分不同作品。后台在上海时区每天 23:30 后整合课程、作品、搭档、学生和 Agent 记忆。
   - 教师可从小教室卡片进入“记忆档案”，查看系统判断、证据事件和相关代码版本，修改或确认判断，暂停检索、限制学生回答／群聊提醒用途，或驳回、删除记忆。每次 Agent 使用记忆都会留下逐次记录，并关联随后十五分钟内的学习过程事件。
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
   - 群聊 `@AI` 使用 DashScope 时需设置 `ALIYUN_API_KEY`；普通 Agent 使用火山引擎时需设置对应 API Key
   - 如需使用期末测试回退或重新开始功能，请设置 `FINAL_TEST_TURNBACK_PASSPHRASE` 和 `FINAL_TEST_RESTART_PASSPHRASE`
   - 如开放学生自助“加入课堂”，请设置 `PAIR_PROGRAMMING_INVITE_CODE`；它只在注册申请时校验，教师导入或新建的学生账号不需要在每次登录时填写邀请码。未配置时本地默认使用 `pair2026`。
   - 需要允许教师自助注册时，必须设置 `TEACHER_REGISTRATION_INVITE_CODE`；留空会关闭教师注册，不存在默认教师邀请码。
   - 如需本地模拟子路径部署，可额外设置 `EDUCHAT_BASE_PATH=/hznu/metaxfang/`
   - 本地调试群聊 `@AI` 时，建议单独启动 Mongo 和 Redis，再用 `npm run dev`
   - HTML/CSS 预览完全在浏览器中完成，本地开发不需要额外代码执行器。
   - 本地默认 Redis 地址可直接使用 `.env` 里的 `GROUP_CHAT_AI_REDIS_URL=redis://127.0.0.1:6380`
   - 如同时部署了 Dify 等也占用宿主机 `6379` 的服务，EduChat 的 Docker Redis 默认映射到宿主机 `6380`
3. 启动服务：
   - `npm run dev`
   - 该命令会同时启动后端、前端和群聊 `@AI` worker

## 教师登录与开课流程

本平台把“平台管理员”和“授课教师”分开。平台管理员管理全平台的教师、课程、班级、学生、课堂与全局配置；授课教师主动创建或绑定自己的课程，再在课程下维护班级、学生账号、课时和结对小教室。教师的日常登录不需要邀请码。

### 一次性初始化

1. 部署者在 `.env` 中设置唯一的平台管理员账号：`PLATFORM_ADMIN_USERNAME` 与 `PLATFORM_ADMIN_PASSWORD`。服务启动时会创建或更新该管理员；不要在 `.env` 中写死教师或学生名单。
2. 如需允许教师自行开通账号，在 `.env` 中设置 `TEACHER_REGISTRATION_INVITE_CODE`。该邀请码只用于创建教师账号，请由平台管理员私下发放并定期更换。
3. 教师访问 `/login`，点击“教师注册”，填写登录账号、真实姓名、密码和教师邀请码。注册成功后，日常进入平台只需填写账号和密码，再点击“教师登录”。
4. 教师注册不绑定班级。教师登录后先在“课程”中创建或绑定自己的授课课程，再在该课程下维护授课班级；只有在自己的班级范围内，教师才能新增或批量导入学生。平台管理员始终可以查看、调整和接管这些配置。

### 每个授课教师的开课步骤

1. 教师在 `/login` 输入自己的账号和密码，点击“教师登录”。不要点击“学生登录”。
2. 在左侧“课程”中填写课程名称、学期、课程大纲与知识点关系并保存；这些内容是课堂任务和记忆系统引用的课程边界。
3. 在“课时任务”中进入课时列表，新建或编辑当前课时，设置开放课时、提交作业、允许补交和适用班级；本课任务公告应在对应课时内发布。
4. 在“学生与账号”中选择以下任一种方式建立学生账号：
   - 点击“新增学生”：为一名学生设置姓名、学号、班级和初始密码；
   - 点击“批量导入”：先下载 Excel 模板，按模板填写姓名、学号、班级及可选初始密码后上传。学号就是学生登录账号；密码留空时，系统会生成一次性初始密码并在导入结果中显示。
5. 将账号和初始密码安全地发给学生。学生在 `/login` 输入“学号 + 密码”，点击“学生登录”；课堂范围由其账号绑定关系自动识别，无需填写教师姓名或结对编程邀请码。
6. 在“协作课堂”中从已导入、已绑定的学生中选择两人创建结对编程小教室。两名学生进入同一小教室后分别承担 Driver 与 Navigator 角色；教师可通过“进入观察”查看过程，但不能以观察身份改写学生内容。

### 自助加入课堂的边界

- “加入课堂”仅用于尚未由教师导入账号的学生提交申请。学生需填写姓名、学号、班级、密码和 `PAIR_PROGRAMMING_INVITE_CODE`，提交后处于待教师确认状态。
- 已由教师新建或批量导入的学生不需要自助申请，也不需要在日常登录时填写邀请码。
- 教师账号不能通过“学生登录”获得学生会话；学生账号也不能通过“教师登录”进入后台。

## 固定公开 Agent

- `Agent A` → `volcengine / doubao-seed-2-0-pro-260215`
- `Agent B (预留)` → 暂不提供对话，保留后续 Provider 接入位置
- `Agent C (Distance Education)` → `volcengine / doubao-seed-2-0-pro-260215`
- `Agent D (Qwen)` → `aliyun / qwen3.7-plus`
- 新建聊天时必须先选择 agent；选定后会在整个会话生命周期内锁定，不支持会话中途切换

## 群聊 `@AI`

- 群聊里的 `@AI` 默认走 `aliyun / qwen3.7-plus`（DashScope 协议）；学生不能自行选择模型
- 教师可在“系统设置 → 群聊 AI 配置”中调整模型与苏格拉底式教学提示词；运行时配置保存在 MongoDB，不写入 `.env`
- 启用群聊 `@AI` 需配置 `ALIYUN_API_KEY`（或兼容别名 `DASHSCOPE_API_KEY`）
- 群聊 `@AI` 采用 `Web 服务 + Redis 队列 + 独立 worker` 架构
- Worker 通过 Redis 全局信号量最多并行执行 32 个 Qwen 请求，其中参与度分析最多占用 8 个，保留学生主动 `@AI` 的处理容量；增加 Worker 副本不会突破该全局上限
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

## 许可证

本项目采用 MIT License 发布，详见 [LICENSE](./LICENSE) 文件。
