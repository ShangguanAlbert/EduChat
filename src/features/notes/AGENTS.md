# notes feature 协作说明

本文件适用于 `src/features/notes/` 目录及其子目录。

## 职责范围

- 笔记页面入口

## 修改原则

- 这里主要承担 feature 路由和页面壳；更底层的 notes 编辑器、组件、接口能力优先检查 `src/modules/notes/`
- 如果改动已经超出页面入口层，不要把复杂实现继续堆在 `src/features/notes/`
- 不要为了派协作附件或群聊上下文改变笔记编辑器的数据模型；跨功能附件预览优先走既有文档预览和 OSS 能力
