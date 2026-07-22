# Metrix（EduChat）仓库协作说明

本文件适用于整个仓库。

## 项目概览

- 项目名称：`Metrix`（代码与部分部署命名仍兼容 `EduChat`）
- 主要技术栈：`React 19` + `Vite` + `Express 5` + `MongoDB`
- 语言与模块系统：当前代码以 `JavaScript / JSX` 为主，统一使用 `ESM`
- 运行方式：
  - 前端开发服务器：`Vite`
  - 后端服务入口：`server/index.js`
- 联调入口：`npm run dev`

## 当前平台能力

- `npm run dev` 会依次启动 Python Runner、Express（`8787`）、群聊 AI worker 与 Vite（`5173`）；本地 MongoDB、Redis 应复用已独立运行的实例，不要为联调额外启动整套 Docker Compose
- 派协作路由为 `/party`：群聊、任务发布栏和附件保持原有交互；施高俊授课范围会展示 Python 实时协作区
- Python 代码、光标感知、标准输入和运行结果在同一派内同步；服务端通过 Python Runner + Redis 做全局队列和单派互斥，学生运行环境不得开放 `pip install`
- 群聊 `@AI` 默认使用阿里云 DashScope / Qwen 3.7 Plus；模型与苏格拉底式提示词由教师后台写入 MongoDB，`.env` 只提供 DashScope 密钥、Redis 和基础运行配置

## 开发环境

- 使用 `Node.js 20.x`
- 包管理器使用 `npm`
- 首次启动前执行：
  - `npm install`
  - `cp .env.example .env`
- 不要提交真实密钥、数据库凭据或任何 `.env` 中的敏感信息

## 常用命令

- 安装依赖：`npm install`
- 启动前后端联调：`npm run dev`
- 仅启动前端：`npm run dev:web`
- 启动后端：`npm run server`
- 仅启动 Python Runner：`npm run python-runner:dev`
- 仅启动群聊 AI worker：`npm run worker:group-chat-ai`
- 构建前端：`npm run build`
- 代码检查：`npm run lint`
- 单元测试：`npm run test:unit`

如只改动了某个模块，优先运行最小必要的验证命令；不要为了一个局部改动触发大范围、长耗时的无关检查。

## 目录约定

- `src/`：前端应用代码
  - `src/app/`：应用级基础设施，例如鉴权包装、路由聚合、基础路径处理
  - `src/features/`：当前推荐的前端功能模块目录；新功能优先放在这里
  - `src/modules/`：前端模块化子系统（例如 notes）
  - `src/pages/`：历史页面目录；除延续现有实现外，不要优先把新功能继续堆到这里
  - `src/components/`：跨页面复用组件
- `server/`：后端服务
  - `server/modules/`：按领域拆分的后端模块（如 chat、images）
  - `server/routes/`：仍在使用的独立路由注册文件
  - `server/services/` / `server/platform/` / `server/providers/`：服务、平台能力与模型/供应商适配
- `python-runner/`：受限 Python 执行器及其受控依赖清单
- `tests/`：Node 原生测试
- `scripts/`：运维、迁移、回填、诊断脚本
- `docs/`：项目文档
- `dist/`、`node_modules/`、`uploads/`：构建产物或运行时目录，除非任务明确要求，否则不要直接编辑

## 前端约束

- 路由通过 `src/app/routes/index.js` 统一聚合，各功能路由定义应放在各自 `src/features/*/routes.js`
- 当前前端路由入口是 `src/main.jsx` 中的 `BrowserRouter`，不是 React Router data router；在未显式迁移到 `createBrowserRouter` + `RouterProvider` 之前，不要引入仅 data router 可用的 API（例如 `useBlocker`、`useFetcher`、`useRevalidator` 等），否则会直接触发运行时异常并导致页面白屏
- `src/App.jsx` 不要直接从 `./pages/*` 导入页面；请通过 `src/app/routes/` 和 `src/features/` 组织路由
- `src/app/routes/**/*` 不要从 `../../pages/*` 导入内容；优先从对应 `features` 模块暴露路由或页面
- 保持既有风格：
  - 使用函数组件与 hooks
  - 使用双引号
  - 语句末尾保留分号
  - 多行对象、数组、参数列表保留尾随逗号（若周边代码已采用）
- 若功能同时涉及桌面端/移动端视图，先检查现有目录是否已按 `desktop` / `mobile` / `shared` 拆分，并沿用原结构
- 涉及子路径部署时，注意现有 `EDUCHAT_BASE_PATH` 机制，不要写死根路径

## 后端约束

- 后端统一入口是 `server/index.js`
- 新的聊天/图片相关后端能力，优先接入对应模块目录：
  - `server/modules/chat/`
  - `server/modules/images/`
- `server/index.js` 中已通过模块注册函数装配路由；新增能力时优先延续“创建依赖 + 注册路由”的模式
- 不要重新引入已被限制的聚合旧路由实现；遵守现有 ESLint 约束
- API 与 WebSocket 路径需要兼容基础路径重写逻辑；不要假设部署一定在 `/`
- 任何会访问数据库、对象存储或第三方模型服务的改动，都要尽量保持可降级、可报错、可观测
- 群聊 AI 的默认配置、持久化配置和执行 worker 要一起检查；不要将群聊 AI 重新接回已移除的 OpenRouter 或 MiniMax 对话 Provider
- Python Runner 改动必须同时考虑 Docker 限制、Redis 全局容量、每派单任务语义、20 秒执行上限及运行审计不保存完整学生代码

## 测试与验证

- 改动前先判断影响范围，优先运行与改动最接近的验证：
  - 通用检查：`npm run lint`
  - 通用测试：`npm run test:unit`
  - 特定脚本：使用 `package.json` 中已有的 `test:*` / `audit:*` / `backfill:*` 命令
- 新增测试时，优先放到 `tests/` 下与目标模块相邻的分类目录
- 不要顺手修复与当前任务无关的大量失败项；如果发现无关问题，在结果说明里单独提示即可
- 若为联调、真实链路验证或临时冒烟测试而启动本地服务（如 `npm run server`），任务结束后必须主动停止，避免遗留端口占用（例如 `8787`）影响后续开发与测试

## 文档与文案

- 项目现有 README 与用户提示以中文为主；新增文档、提示语、报错文案默认使用简体中文，除非目标文件已有明确英文约定
- 若改动引入新的环境变量、脚本或运行步骤，请同步更新 `README.md` 或相关文档
- `.env.example` 只允许占位值；`.env` 始终忽略且不得输出、复制或提交真实密钥、账号名单、MongoDB 口令

## 变更原则

- 优先做小而集中的修改，避免无关重构
- 优先修根因，不做只掩盖症状的补丁
- 用户明确不喜欢“兜底代码优先”的处理方式；遇到白屏、运行时异常、路由错误、接口异常等问题时，先定位实际报错和根因，再做最小、精准、可解释的修复，不要先堆 fallback、try/catch 包裹层、条件分支兜底或静默降级来掩盖问题
- 保持现有目录边界与命名习惯，不随意迁移文件
- 未经明确要求，不要：
  - 升级大版本依赖
  - 引入 TypeScript、状态管理库或新的基础设施
  - 修改构建产物
  - 提交密钥、测试数据或本地缓存文件

## 给后续 Agent 的建议

- 开始修改前，先读 `README.md`、`package.json` 与目标目录附近代码，确认该功能是走 `features`、`modules` 还是历史 `pages` 路径
- 如果需要新增路由，先检查前端是否已有 feature route 聚合、后端是否已有 module route 注册点，再决定落点
- 如果出现“页面白屏 / 打不开 / 一片空白”这类前端问题，先抓真实运行时报错，再核对当前 router 类型、hook 上下文、必需 provider、页面顶层 effect；不要在没有报错证据的情况下先加兜底渲染或保护分支
- 这类仓库里 React Router 相关问题要先确认 API 是否与 `BrowserRouter` 兼容；尤其是离开确认、导航拦截、fetcher/revalidator 一类能力，先看 `src/main.jsx`，再决定能不能用对应 hook
- 如果任务涉及部署问题，重点关注：
  - `EDUCHAT_BASE_PATH`
  - `vite.config.js`
  - `server/index.js`
  - `.env.example`
