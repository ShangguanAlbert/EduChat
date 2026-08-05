# server/modules 目录协作说明

本文件适用于 `server/modules/` 目录及其子目录；若更深层目录存在自己的 `AGENTS.md`，以更深层说明为准。

## 目录职责

- 这里承载按领域拆分的后端模块
- 每个模块优先包含：
  - `create*Deps.js`
  - `routes.js`
  - 可选的 `services/`
- 当前模块还包括 `music/` 与 `party-coding/`；后者包含 HTML/CSS 实时协作、角色阶段、过程事件和 PAIA 介入接口

## 模块设计原则

- `create*Deps.js` 负责从根依赖中裁剪模块所需能力
- `routes.js` 负责注册本模块的 HTTP 路由
- `services/` 负责更细粒度的 handler 或服务逻辑
- 模块之间尽量通过显式依赖协作，不要偷用全局状态

## 变更建议

- 新模块优先沿用当前结构，不要把模块内部再次做成“大杂烩 index.js”
- 若模块仍桥接历史实现，可以渐进替换，但不要在一次改动里做大规模重构
- 接口字段规范优先复用 `shared/contracts/`
- 网页协作实时事件要按派隔离；过程事件只保存必要元数据，完整作品由版本化工作区保存
