# server/modules/party-coding 协作说明

本文件适用于 `server/modules/party-coding/` 目录及其子目录。

## 职责范围

- 派内 HTML/CSS 双文档、光标、角色、任务阶段和预览状态的 HTTP/实时同步
- 学习过程事件、PAIA 主动介入和学生判断纠正记录

## 不可变约束

- 网页预览只能由浏览器受限 iframe 完成；不得在 Express 或 worker 中执行学生脚本
- 仅 Driver 可编辑和刷新预览，Navigator 负责观察、讨论和检查；仅派主可恢复版本
- 实时同步要按 `roomId` 严格隔离，HTML/CSS Yjs 状态不得串派
- 过程事件只保存必要元数据，不在事件表重复保存完整网页代码或附件内容

## 变更与验证

- 改动路由或 `realtime.js` 时，检查前端 `WebCollabPanel`、WebSocket 事件和 `tests/server/` 相关用例
- 修改预览能力时同步检查 CSP、iframe sandbox、危险标签和 URL 清理，不得开放脚本权限
