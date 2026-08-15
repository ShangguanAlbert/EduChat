# 群聊 AI 后台 Notes 与主动参与架构方案

## Summary

- 目标：在现有群聊 `@AI` 基础上，为每个群维护后台 `notes`，并让 AI 在**确定性的"补位"场景**下主动开口。
- 群聊 AI 全局固定为 `aliyun / qwen3.7-plus`，学生不可选择模型。
- 第一版不落真实 Markdown 文件，不给前台展示笔记；`notes` 仅作为后台长期上下文。
- 主动参与 v1 **只做一种触发**：**悬空问题应答**(orphan-question answer)
  - 群内出现疑问/求助语气
  - 一段时间内无人有效回答
  - 没有任何人 `@AI`
  - AI 才主动答一次
- v1 显式**不做**以下两类(留到 v2，依赖真实数据再放开)：
  - 空闲后轻提醒(idle nudge)
  - 讨论卡住时介入(stuck intervention)
- 主动参与链路 **不占用正常 `@AI` 的执行容量**：
  - 学生手动 `@AI` 使用主 worker 池
  - 后台 `notes` 刷新与主动应答使用独立 proactive worker 池
- 实时链路红线：
  - 空闲挂机时不能自己循环
  - 重复事件不能放大副作用
  - 无变化时不能重复写 state 或重复广播

## Goals

- 让群聊 AI 不只在学生 `@AI` 时被动响应，而是能长期理解每个群在讨论什么。
- 让 AI 在**用户已经表达需要帮助、但没人响应**的情况下补位答题。
- 保证学生手动 `@AI` 的稳定性和响应优先级，不被后台主动任务拖慢。
- 显式拒绝"AI 主动引导学习"型行为(纪律委员化)——v1 只做补位，不做引导。

## Non-Goals (v1)

- **不做** AI 自发引导讨论方向、把闲聊拉回学习。
- **不做** 基于 LLM 主观判定的"讨论卡住"介入。
- **不做** 群聊笔记的前台展示、下载、编辑。
- **不做** 主动参与频率/开关的 UI 配置(只走服务端配置)。
- **不做** 教师可视的"AI 巡课"定时总结(v2 候选)。

## Architecture

### 1. 基础分层

- Web 服务负责：
  - 接收群消息
  - 落库用户消息
  - 识别消息是否为疑问/求助
  - 在满足条件时创建 AI 任务
  - 通过群聊 WebSocket 广播 AI 消息
- Redis 负责：
  - 防抖键
  - 延迟调度
  - 队列
  - 任务去重
  - worker 抢占协调
- Mongo 负责：
  - 持久化群聊消息
  - 持久化 `GroupChatAiTask`
  - 持久化 `GroupChatRoomNotes`
- AI workers 分为两类：
  - `group-chat-ai-worker`：只处理学生手动 `@AI`
  - `group-chat-ai-proactive-worker`：处理 `notes_refresh`、`proactive_check`、`proactive_answer`

### 2. 为什么要独立 proactive worker 池

- 主动参与本质上是后台增强能力，不应该影响学生显式触发的 `@AI`。
- 如果主动任务和 `@AI` 回复共用同一执行池，即使做了优先级，也仍可能在高峰时抢占 worker 槽位。
- 因此第一版直接固定为：
  - 共用 Redis
  - 共用 Mongo
  - 共用任务模型
  - 共用固定 GPT-5.4
  - **不共用执行容量**
- 结果是：
  - proactive worker 挂掉，不影响正常 `@AI`
  - proactive worker 堵塞，不影响正常 `@AI`
  - 调整主动参与频率时，不会误伤主链路

### 3. 任务类型

- `mention_reply`
  - 学生在群聊中显式 `@AI`
  - 沿用当前群聊 `@AI` 流式回复能力
- `notes_refresh`
  - 后台刷新房间长期笔记
  - 纯维护任务，**不**派生主动消息
  - 不向前台创建消息，不触发任何房间广播
- `proactive_check`
  - 主动判定任务，独立排队
  - 输入：当前 notes + 新增消息 + 触发原因
  - 输出：是否创建 `proactive_answer`
  - 拆出独立任务的目的：让 `notes_refresh` 的事务不被判定逻辑污染
- `proactive_answer`
  - AI 主动发起一条普通群消息(v1 唯一允许的主动消息形态)
  - 带 `AI 主动发起` 标记
  - `triggerReason` 字段记录具体原因，v1 只允许 `orphan_question`

### 4. 固定模型策略

- 四类任务统一固定为：
  - `agentId = "A"`
  - `provider = "aliyun"`
  - `model = "gpt-5.4"`
  - `protocol = "chat"`
- 理由：
  - 现有仓库已稳定接入 `Agent A -> gpt-5.4`
  - 文件理解、图片理解、长上下文能力更适合群聊场景
  - 避免不同触发方式下群聊 AI 行为漂移

## Data Model

### 1. `GroupChatRoomNotes`

- 新建集合，`roomId` 唯一。
- 字段建议包含：
  - `roomId`
  - `provider`
  - `model`
  - `notes`(结构化对象，见下)
  - `notesHash`(关键字段子集的 hash，用于等价判定)
  - `summaryUpToMessageId`
  - `lastSourceMessageAt`
  - `lastRefreshedAt`
  - `lastProactiveAt`
  - `cooldownUntil`
  - `lastProactiveDecision`
  - `openQuestionsState`(见下)
- `notes` 采用后台结构化记忆，而不是单段长文本：
  - `roomTopic`
  - `currentFocus`
  - `facts`
  - `openQuestions` —— v1 关键字段，驱动主动应答
  - `fileSummaries` —— 容量受限(见下)
  - `participantSignals`
  - `doNotRepeat`

#### `openQuestions` 单项结构

- `id`：稳定 id，避免每次刷新重建
- `messageId`：原始疑问消息
- `askerUserId`
- `text`：精简后的问题描述
- `topicRelevant`：bool，是否与本群课程/材料相关(v1 主动应答的硬闸门)
- `firstSeenAt`
- `state`：`open | answered_by_human | answered_by_ai | stale`
- `lastEvaluatedAt`

#### `fileSummaries` 容量约束

- 最多保留 20 项
- 按 `lastReferencedAt` LRU 淘汰
- 单项摘要 ≤ 1KB
- 禁止落入：大段原文、整页 PDF 文本、base64、超长表格原文

### 2. `GroupChatAiTask`

- 复用现有 `GroupChatAiTask`，新增：
  - `taskType`：`mention_reply | notes_refresh | proactive_check | proactive_answer`
  - `roomNotesVersion` 或 `roomNotesUpdatedAt`
  - `triggerReason`：v1 唯一允许 `orphan_question`
  - `relatedQuestionId`：指向 `openQuestions` 的某一项

### 3. `GroupChatMessage.aiMeta`

- 扩展字段：
  - `taskType`
  - `initiative: passive | proactive`
  - `triggerReason`
  - `notesUpdatedAt`
- 主动消息固定为：
  - `senderKind = "ai"`
  - `initiative = "proactive"`
  - `taskType = "proactive_answer"`
  - `triggerReason = "orphan_question"`(v1)

## Notes Strategy

### 1. 后台 notes 的定位

- `notes` 是群聊 AI 的长期结构化上下文，不是前台可见文档。
- 第一版不提供下载、查看、编辑入口。
- 如果后续需要人工查看，可在调试接口或管理工具里临时渲染为 Markdown 文本，但不作为正式存储格式。

### 2. 长期摘要 + 近期增量

- 不持续重扫整个群历史。
- 每次只处理 `summaryUpToMessageId` 之后的新消息，再和旧 `notes` 合并。
- 附件只保留摘要、关键结论、需要追问的点；不保留原文。

### 3. 刷新触发方式

- 每次新的非 AI 群消息到达后，刷新房间的 Redis 防抖键。
- 默认防抖时间：`90s`
- 只要房间持续有新消息，就继续推迟 `notes_refresh`。
- 群聊安静一段时间后，再创建一次 `notes_refresh`。
- 第一版不做全量周期扫描所有房间，避免大量空转任务。
- 防抖调度必须幂等：
  - 同一房间在同一窗口内最多保留 1 个待执行 `notes_refresh`
  - 新消息只能覆盖到期时间，不能额外堆积重复任务
- `notes_refresh` 完成后不允许向前台广播 `room_updated`、`presence` 或其他可见事件。

### 4. Notes 等价判定

- 不使用整体 JSON 字面比较(LLM 输出有措辞抖动，几乎不会等价)。
- 用 `notesHash` 比较关键字段子集：
  - `roomTopic`、`currentFocus`、`openQuestions[].id|state`、`facts` 的稳定 key 集合
- `summaryUpToMessageId` 必须前进；否则视为无进展，跳过后续步骤。
- 等价时仅更新 `lastRefreshedAt`，不入队 `proactive_check`。

## Proactive Participation (v1)

### 1. 唯一触发：悬空问题应答 (orphan_question)

满足**全部**以下条件时，才创建 `proactive_answer`：

- 群内最近一条消息为疑问/求助语气，且该消息归属一条 `openQuestions` 项
  - 该项 `state = open`
  - 该项 `topicRelevant = true`
  - 该项 `firstSeenAt` 距今 ≥ `ORPHAN_WAIT_MIN_MS`(默认 `5min`)
  - 该项 `firstSeenAt` 距今 ≤ `ORPHAN_WAIT_MAX_MS`(默认 `15min`，过久视为已凉)
- 自该项 `messageId` 之后，群内无任何**有效人类回答**
  - 简单实现：该项之后无非提问者发的、非疑问语气的、长度 ≥ 8 字的人类消息
- 自该项 `messageId` 之后，群内无任何 `@AI`
- 同房间无 `mention_reply` 处于 `pending/running`
- 同房间无其他 `proactive_*` 任务处于 `pending/running`
- 当前时间在允许时间窗内(`PROACTIVE_TIME_WINDOW`，例如 07:00–23:00)
- 同房间距上次任何 `proactive_answer` ≥ `PROACTIVE_COOLDOWN_MS`(默认 `30min`)

### 2. 话题相关性闸门

- `openQuestions[].topicRelevant` 由 `notes_refresh` 时一并判定
- 判定输入：当前 `roomTopic` + `currentFocus` + 该问题文本
- 与课程/题目/材料无关的疑问(闲聊、生活、八卦)一律 `topicRelevant = false`，不进入主动应答候选
- 宁可漏答，不要误答

### 3. 内容边界

- v1 主动消息只允许：
  - 直接尝试回答该 `openQuestions` 中的具体问题
  - 必要时引用群内已有文件/材料
- v1 禁止：
  - 拉回学习主题型的"引导发言"
  - 总结群讨论
  - 追问用户
  - 任何不指向具体 `openQuestions` 项的发言
  - 与该房间上一条主动消息相同/近似表述

### 4. 消息形态

- 主动消息作为普通群消息插入消息流。
- 不挂在某条学生消息下，但**必须**通过 `aiMeta.relatedQuestionId` 关联到具体问题项。
- 前端显示标签：
  - `AI 主动发起 · GPT-5.4`

### 5. v2 候选(本期不实现)

以下场景**不在 v1 范围**，仅作为 v2 评估候选：

- 空闲后轻提醒(idle nudge)
- 讨论卡住时介入(stuck intervention)
- 教师配置的定时巡课总结

v2 是否启用，应基于 v1 真实数据：
- 主动应答的发出量、被点赞/被忽略比例
- 教师/学生对主动消息的关闭率
- 误答(主动消息后被人类纠正)率

## Queueing and Isolation

### 1. 主链路与主动链路隔离

- 学生手动 `@AI`：
  - 队列：主 `mention_reply` 队列
  - worker：`group-chat-ai-worker`
  - 容量：沿用当前主 worker 并发配置
- 后台 `notes_refresh` / `proactive_check` / `proactive_answer`：
  - 队列：独立 proactive 队列(可单队列按 `taskType` 分流，也可三个子队列)
  - worker：`group-chat-ai-proactive-worker`
  - 容量：独立 proactive 并发配置

### 2. 隔离原则

- proactive worker **不占用** 主 `@AI` worker 槽位。
- proactive worker 的 Redis 队列与消费循环独立。
- 即使主动任务堆积，也不能延迟学生 `@AI`。
- 主动任务仍可复用相同的 Redis 连接、Mongo 连接、任务表、GPT-5.4 运行时。

### 3. 任务编排：refresh → check → answer 拆分

- `notes_refresh` 只负责更新 notes 与 `openQuestions`；事务结束**只**在满足条件时入队一个 `proactive_check`，不直接生成 `proactive_answer`。
- `proactive_check` 拉起时重新读取最新 notes 与最近消息，独立判定；任何判定失败/抛错都**不**回滚 notes。
- `proactive_check` 通过后才入队 `proactive_answer`，并在房间冷却键上加锁。
- 拆分目的：主动判定的不确定性不能污染笔记内容；笔记刷新的时延不能被判定绑架。

### 4. 主动任务频控

- 同一房间任意时刻最多 `1` 个 `proactive_*` 任务处于 `pending/running`。
- 同一房间 `30min` 内最多发送 `1` 条主动消息。
- 只要同房间存在 `mention_reply` 的 `pending/running`，禁止创建新的 `proactive_check` / `proactive_answer`。
- `notes_refresh` 可以继续排队，但优先级低于学生手动 `@AI`。

## Realtime Guardrails

### 1. 这条链路默认按"空闲也会长时间挂着"设计

- 不能把后台 notes 当成一次性任务链路来写。
- 必须默认假设：
  - 群聊页面会空挂 `10-60` 分钟
  - 用户会切换房间但不刷新页面
  - WebSocket 与 worker 推送会长期共存
  - `message_updated`、`presence`、房间同步会并行出现

### 2. 所有后台调度默认幂等

- 同一房间重复收到"需要刷新 notes"的信号时，结果必须稳定。
- 同一个 `notes_refresh` 完成后，不允许再反向触发新的同类任务形成闭环。
- 同一条主动消息判定结果，如果输入上下文没有变化，不能重复建任务。
- 同一房间的冷却状态、去重键和判定锁必须能阻断重复触发。

### 3. Notes 刷新不能变成实时广播热点

- `notes_refresh` 只写 `GroupChatRoomNotes`，不改群消息流，不更新房间活动时间，不写已读状态。
- 禁止把"后台 notes 更新时间"映射成前台房间 `updatedAt`。
- 禁止因为后台 notes 更新而触发房间重排序、房间重订阅或 presence 重算。
- 只有真正创建 `proactive_answer` 消息时，才允许走一次正常的 `message_created` 广播。

### 4. 前端消费主动消息也要避免 no-op 更新

- 新增 `initiative = "proactive"` 只是一种消息类型，不能引入新的全量房间重刷逻辑。
- 若同一条主动消息的补丁内容没有变化，前端必须跳过 no-op state write。
- 禁止收到主动消息后无条件重跑全部房间订阅同步。
- 禁止把"后台任务状态变化"直接透传成高频前端 state 变化。

### 5. 不允许出现新的自循环闭环

- 需要明确规避以下链路：
  - 新消息 → 防抖任务 → notes_refresh → room_updated → 前端重订阅 → 新一轮后台信号
  - 主动消息 → 再次触发主动判定 → 连续主动消息
  - 主动消息 → 学生回应/追问 → 触发新一轮 orphan 判定 → 又一条主动消息
  - notes 刷新 → 房间时间变化 → 前端重排/重订阅 → 再次产生后台任务
- 防线：
  - `notes_refresh` 是纯后台维护
  - `proactive_answer` 发出后必须进入房间冷却(`PROACTIVE_COOLDOWN_MS`)，期间禁止任何 `proactive_check`
  - 主动消息**自身**永远不进入 `openQuestions`
  - 同一 `openQuestions` 项一旦被 `proactive_answer` 处理，标记 `state = answered_by_ai`，**不可**再被同一原因二次主动应答

## Backend Flow

### 1. 新消息进入后的流程

1. 用户发送群消息。
2. 服务端正常落库并广播。
3. 若是学生显式 `@AI`：
   - 继续创建 `mention_reply` 任务
   - 推入主 `@AI` 队列
4. 若是普通人类消息：
   - 更新房间 notes 防抖键
   - 到达防抖时机后创建 `notes_refresh`
   - 该过程不得回写房间可见状态，不得触发额外前端重订阅

### 2. `notes_refresh` 流程

1. proactive worker 拉取 `notes_refresh`。
2. 读取 `summaryUpToMessageId` 之后的新消息。
3. 结合旧 `notes` 生成新的结构化笔记，重点维护 `openQuestions` 与其 `state`、`topicRelevant`。
4. 写回 `GroupChatRoomNotes`，更新 `notesHash`。
5. 若 `notesHash` 与 `summaryUpToMessageId` 都无进展，结束。
6. 若存在 `state = open` 且 `topicRelevant = true` 且超过 `ORPHAN_WAIT_MIN_MS` 的项，入队一个 `proactive_check`。
7. `notes_refresh` 本身**不**直接生成主动消息。

### 3. `proactive_check` 流程

1. proactive worker 拉取 `proactive_check`。
2. 重新读取最新 notes 与最近消息。
3. 检查"悬空问题应答"全部触发条件(见 Proactive §1)。
4. 满足条件：入队 `proactive_answer`，写入 `relatedQuestionId`，房间设置短期判定锁。
5. 不满足：结束，不留任何前台副作用。

### 4. `proactive_answer` 流程

1. proactive worker 拉取 `proactive_answer`。
2. 再次校验：
   - 冷却时间
   - 是否有主 `@AI` 任务正在跑
   - 是否已存在房间主动消息任务
   - `relatedQuestionId` 仍处于 `open` 且 `topicRelevant = true`
3. 满足条件才生成文本。
4. 生成一条普通 AI 群消息并广播。
5. 更新 `openQuestions[id].state = answered_by_ai`、`lastProactiveAt`、`cooldownUntil`、`lastProactiveDecision`。
6. 主动消息发出后强制进入冷却，禁止基于自己刚发出的消息再次触发判定。

## Frontend Impact

- 现有群聊消息流基本不变。
- 仅需补充：
  - 识别 `initiative = "proactive"`
  - 渲染 `AI 主动发起 · GPT-5.4`
  - 与普通 `@AI` 回复做轻度样式区分
  - 对主动消息的重复 patch 跳过 no-op state write
- 第一版不做：
  - 群笔记查看面板
  - 主动参与开关 UI
  - 主动参与频率配置 UI

## Deployment and Runtime

- 在现有 `docker-compose` 基础上增加一个 proactive worker 服务。
- 本地开发继续保持：
  - Mongo 单独起
  - Redis 单独起
  - `npm run dev` 启动 Web + 主 `@AI` worker + proactive worker
- 服务端部署保持：
  - `docker compose up -d --build`
- 新增的环境变量或服务端常量至少包括：
  - `GROUP_CHAT_PROACTIVE_ENABLED`
  - `GROUP_CHAT_NOTES_DEBOUNCE_MS`(默认 `90_000`)
  - `GROUP_CHAT_ORPHAN_WAIT_MIN_MS`(默认 `300_000`，5min)
  - `GROUP_CHAT_ORPHAN_WAIT_MAX_MS`(默认 `900_000`，15min)
  - `GROUP_CHAT_PROACTIVE_COOLDOWN_MS`(默认 `1_800_000`，30min)
  - `GROUP_CHAT_PROACTIVE_TIME_WINDOW`(默认 `07:00-23:00`)
  - `GROUP_CHAT_PROACTIVE_WORKER_CONCURRENCY`

### 关停与降级语义

`GROUP_CHAT_PROACTIVE_ENABLED=false` 时的具体行为：

- 不再创建新的 `proactive_check` 与 `proactive_answer` 任务。
- 已入队但未开始的 `proactive_check` / `proactive_answer`：worker 拉起后立即标记为 `skipped`，不执行 LLM 调用。
- 已在 running 的 `proactive_answer`：允许跑完(避免半截消息)，但发完后不再后续动作。
- `notes_refresh` **仍正常运行**(它是纯后台维护，不产生用户可见副作用)。
- 前端：存量主动消息照常展示标签；只是不再有新的主动消息产生。

## Test Plan

- 普通群消息不带 `@AI` 时，现有行为不变。
- 学生手动 `@AI`：
  - 继续由主 worker 处理
  - 不依赖 proactive worker
- `notes_refresh`：
  - 连续消息只触发一次防抖刷新
  - 只总结增量消息
  - 文件内容只进入摘要，不进入原文堆积
  - `fileSummaries` 超过 20 项时按 LRU 淘汰
  - notes 内容等价(hash 一致且 `summaryUpToMessageId` 无进展)时不派生 `proactive_check`
- `proactive_check`：
  - 满足条件才入队 `proactive_answer`
  - 任何子条件不满足都安静结束，不留前台副作用
  - 判定失败不影响 notes
- `proactive_answer` 触发(orphan_question)：
  - 群内出现疑问，5min 无人有效回答 → 触发
  - 同样问题在 5min 内被人类回答 → 不触发
  - 同样问题与本群课程无关(`topicRelevant=false`) → 不触发
  - 触发时间在 23:00 后 → 不触发
  - 同房间 30min 内已有过主动消息 → 不触发
  - 触发时房间存在 `mention_reply` 在跑 → 不触发
  - 同一 `openQuestions` 项被主动应答过后 → 不再二次主动应答
- 关停语义：
  - `GROUP_CHAT_PROACTIVE_ENABLED=false` 后，新主动消息不再产生
  - `notes_refresh` 仍正常跑
  - 存量主动消息前端展示不变
- 实时链路防线：
  - 后台 notes 更新不会触发房间 `updatedAt` 变化
  - 后台 notes 更新不会触发 `room_updated` 噪音广播
  - 空闲挂机时不会因为主动参与链路持续产生 WebSocket 往返帧
  - 主动消息和消息补丁在无变化时不会重复写前端 state
  - 主动消息发出后 30min 内，即使学生追问也不会再次触发新一轮 `proactive_answer`
- 容量隔离：
  - 主动 worker 堵塞时，学生手动 `@AI` 仍能正常运行
  - 学生手动 `@AI` 高并发时，主动 worker 不会占用主链路槽位
- 恢复与幂等：
  - worker 重启后不重复发送同一条主动消息
  - proactive worker 异常不会影响正常 `@AI`

## Assumptions

- 第一版群聊 AI 固定使用 `aliyun / qwen3.7-plus`。
- 第一版不做真实 Markdown 文件，不做前台群笔记展示。
- 第一版全局默认开启主动参与，但仅通过服务端配置控制。
- 第一版主动消息**只补位、不引导**：仅在用户已经明确表达需要帮助、且无人响应时介入。
- 第一版最重要的工程原则是：
  - **主动参与是补位，不是引导**
  - **不能影响正常 `@AI` 主链路**
  - **不能把群聊实时链路重新写成空闲自循环**
  - **宁可漏答，不要误答**
