# src/features 目录协作说明

本文件适用于 `src/features/` 目录及其子目录；若更深层目录存在自己的 `AGENTS.md`，以更深层说明为准。

## 目录职责

- `src/features/` 是前端新功能的首选落点
- 每个 feature 应尽量自包含，通常由以下内容组成：
  - `routes.js`
  - `pages/`
  - 可选的 `api/`
  - 可选的 `services/`

## 组织原则

- 路由定义放在 feature 自己的 `routes.js`
- 页面组件放在 `pages/`
- 远程请求封装放在 `api/`
- 与 UI 解耦的前端业务逻辑优先放在 `services/`
- 不要把 feature 私有逻辑随意散落到 `src/pages/` 或根级 `src/components/`

## 依赖方向

- 推荐依赖方向：`pages -> services/api -> shared/app`
- 尽量避免 feature 之间直接深度耦合
- 可复用契约、规范化函数优先来自 `shared/`

## 变更建议

- 新增 feature 时，先补 `routes.js`，再接入 `src/app/routes/index.js`
- 修改 API 数据结构时，同时检查：
  - 当前 feature 的 `api/`
  - 对应页面
  - `shared/contracts/`
- 群聊、Python 协作和其教师质控页面如仍由历史 `src/pages/` 承载，feature 仅负责路由入口；不要为了目录形式把稳定的实时逻辑大规模搬迁
