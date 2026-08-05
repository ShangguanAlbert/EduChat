# tests 目录协作说明

本文件适用于 `tests/` 目录及其子目录。

## 目录职责

- 本目录存放基于 `node:test` 的自动化测试
- 测试按领域分组，当前主要包括：
  - `tests/chat/`
  - `tests/contracts/`
  - `tests/platform/`
  - `tests/server/`

## 编写原则

- 新测试优先靠近被测领域放置
- 测试文件命名沿用 `*.test.js`
- 保持测试小而聚焦，一个测试文件服务一个明确模块或契约

## 测试风格

- 使用：
  - `node:test`
  - `node:assert/strict`
- 测试名称要直接描述行为和预期
- 优先覆盖公开行为，不要过度绑定内部实现细节
- 断言要稳定、明确，避免依赖脆弱的日志文本或随机顺序

## 数据与依赖

- 默认写成可重复执行、无外部副作用的测试
- 优先使用最小输入构造测试数据
- 除非任务明确要求做集成验证，否则不要让单测强依赖真实数据库、网络或对象存储

## 与代码改动的联动

- 修改 `shared/` 契约时，优先补 `tests/contracts/`
- 修改 `server/platform/` 或路由过滤逻辑时，优先补对应平台或服务端测试
- 修改聊天或图片模块时，先找现有相关测试文件，优先扩展而不是重复新建相似测试
- 群聊 AI 配置、提示词边界、附件解析、PAIA 判断规则与队列行为优先放入 `tests/server/`；测试不得使用真实 Provider Key、Redis、MongoDB、OSS 或学生账号名单
- 修改 `scripts/dev-runtime.mjs` 时，同步更新 `tests/scripts/dev-runtime.test.js`，确保 `npm run dev` 仍启动服务端、群聊 AI worker 和 Vite

## 结果要求

- 测试应能清楚说明回归点
- 不要为了让测试通过而改变业务语义
- 若发现无关失败项，可以记录，但不要顺手大面积改写无关测试
