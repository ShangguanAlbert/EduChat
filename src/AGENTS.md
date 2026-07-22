# src 目录协作说明

本文件适用于 `src/` 目录及其子目录。

## 目录职责

- 本目录是前端应用代码
- 当前结构同时包含：
  - `src/app/`：应用级基础设施
  - `src/features/`：推荐的新功能落点
  - `src/modules/`：前端模块化子系统
  - `src/pages/`：历史页面目录
  - `src/components/`：复用组件

## 组织优先级

- 新增功能优先落到 `src/features/`
- 应用级路由聚合放在 `src/app/routes/`
- 共享的基础能力放在 `src/app/` 或合适的 `components/` / `modules/`
- 除非是在延续现有旧实现，否则不要继续优先往 `src/pages/` 堆新逻辑

## 路由约束

- `src/App.jsx` 通过 `src/app/routes/index.js` 聚合路由
- 各 feature 自己维护路由定义，再统一汇总
- 遵守现有 ESLint 限制：
  - `src/App.jsx` 不直接从 `./pages/*` 导入
  - `src/app/routes/**/*` 不从 `../../pages/*` 导入

## 组件与状态

- 优先写小而清晰的函数组件
- 状态尽量就近放置；只有确有必要时再上提
- 组件应尽量单一职责，避免一个页面文件同时承担路由、数据编排、展示和样式细节
- 如果某功能已有 `desktop` / `mobile` / `shared` 目录划分，新增内容时保持同样结构

## 样式与资源

- 样式沿用当前项目已有组织方式，不强行引入新的样式方案
- 涉及静态资源或基础路径的引用时，注意兼容 `EDUCHAT_BASE_PATH`
- 不要写死接口根路径、WebSocket 根路径或资源绝对路径

## 代码风格

- 使用 `JSX` + hooks
- 双引号
- 语句末尾分号
- 命名要贴近业务语义，避免晦涩缩写
- 修改时尽量贴着现有 feature / module 的写法做，不做风格漂移

## 改动建议

- 改 API 调用时，同时检查 `shared/contracts/` 是否已有对应规范化函数
- 改鉴权、路由跳转、基础路径时，优先检查：
  - `src/app/authStorage.js`
  - `src/app/basePath.js`
  - `src/app/routes/`
- 未经明确要求，不要引入新的全局状态库或大规模重写页面结构
- 派协作主要实现仍位于 `src/pages/party-chat/`：桌面布局、侧栏、任务发布栏、CodeMirror 协作区和控制台改动应沿用既有组件边界；不要为小改动引入新的编辑器或实时同步库
- 涉及群聊 AI 配置的前端管理界面时，保持教师后台与学生群聊职责分离，不暴露 API Key、系统提示词内部实现或运行审计中的敏感内容
