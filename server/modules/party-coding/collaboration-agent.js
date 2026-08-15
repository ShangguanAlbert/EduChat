const SUPPORT_NEEDS = new Set([
  "shared_goal",
  "mutual_explanation",
  "role_coordination",
  "productive_debugging",
  "ai_verification",
  "reflection",
]);

const STAGE_LABELS = Object.freeze({
  understand: "理解任务",
  plan: "设计方案",
  build: "编写网页",
  debug: "调试改进",
  reflect: "总结反思",
});

const SUPPORT_STRATEGIES = Object.freeze({
  shared_goal: ["goal_success_criteria", "goal_restate"],
  mutual_explanation: ["explanation_round", "option_compare"],
  role_coordination: ["driver_navigator_check", "two_voice_checkpoint"],
  productive_debugging: ["hypothesis_test", "smallest_reproduction"],
  ai_verification: ["adopt_or_reject", "claim_evidence_check"],
  reflection: ["keep_change", "event_learning"],
});

// This is the agent's stable instructional stance. It is deliberately separate
// from learner and group memories, which are created only from validated events.
export const LINLIN_COLLABORATION_SOUL = Object.freeze({
  version: 1,
  name: "琳琳",
  role: "协作学习的过程支持者",
  publicMessageRules: [
    "面向小组共同目标，不评价或比较个人。",
    "只给出当前可执行的一步邀请，不公开诊断证据或个人对象。",
    "使用友善、具体、可选择的中文表达。",
  ],
});

export const COLLABORATION_SUPPORT_NEEDS = Object.freeze([...SUPPORT_NEEDS]);

function safeText(value, maxLength = 800) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replaceAll("\0", "")
    .trim()
    .slice(0, maxLength);
}

function safeIsoDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function normalizeSupportNeed(value, fallback = "role_coordination") {
  const normalized = safeText(value, 60).toLowerCase();
  return SUPPORT_NEEDS.has(normalized) ? normalized : fallback;
}

export function deriveSupportNeedFromParticipation(reasonCodes = []) {
  const reasons = new Set(
    (Array.isArray(reasonCodes) ? reasonCodes : [])
      .map((item) => safeText(item, 60).toLowerCase())
      .filter(Boolean),
  );
  if (reasons.has("one_sided_decision_making")) return "mutual_explanation";
  return "role_coordination";
}

export function deriveSupportNeedFromTrigger(triggerType) {
  const normalized = safeText(triggerType, 80).toLowerCase();
  if (normalized === "quick_agreement") return "mutual_explanation";
  if (normalized === "repeated_trial") return "productive_debugging";
  if (normalized === "ai_answer_adoption") return "ai_verification";
  return "role_coordination";
}

function normalizeStrategyKey(supportNeed, strategyKey) {
  const strategies = SUPPORT_STRATEGIES[supportNeed] || [];
  const normalized = safeText(strategyKey, 80).toLowerCase();
  return strategies.includes(normalized) ? normalized : strategies[0];
}

function selectSupportStrategy(supportNeed, memories = []) {
  const strategies = SUPPORT_STRATEGIES[supportNeed];
  const relevantMemory = (Array.isArray(memories) ? memories : []).find(
    (memory) => normalizeSupportNeed(memory?.supportNeed, "") === supportNeed,
  );
  if (!relevantMemory) {
    return { strategyKey: strategies[0], memoryPolicy: "default_strategy" };
  }
  const rememberedStrategy = normalizeStrategyKey(
    supportNeed,
    relevantMemory?.strategyKey,
  );
  const verdict = safeText(relevantMemory?.verdict, 20).toLowerCase();
  if (verdict === "correct") {
    return {
      strategyKey: rememberedStrategy,
      memoryPolicy: "reuse_validated_strategy",
    };
  }
  if (verdict === "partial" || verdict === "incorrect") {
    return {
      strategyKey: strategies.find((item) => item !== rememberedStrategy) || strategies[0],
      memoryPolicy: verdict === "partial"
        ? "explore_after_partial_feedback"
        : "avoid_rejected_strategy",
    };
  }
  return { strategyKey: strategies[0], memoryPolicy: "default_strategy" };
}

export function buildFriendlySupportPrompt({
  supportNeed,
  taskStage,
  strategyKey,
} = {}) {
  const normalizedNeed = normalizeSupportNeed(supportNeed);
  const normalizedStrategy = normalizeStrategyKey(normalizedNeed, strategyKey);
  const stage = safeText(taskStage, 30).toLowerCase();
  const stageHint = STAGE_LABELS[stage] ? `现在正处在“${STAGE_LABELS[stage]}”阶段，` : "";
  const prompts = {
    goal_success_criteria: `${stageHint}请你们先用一句话对齐：这一步准备完成什么、怎样算完成；确认后再继续。`,
    goal_restate: `${stageHint}可以请一位同学复述当前目标，另一位补充一个容易遗漏的要求，再一起确认下一步。`,
    explanation_round: `${stageHint}不妨轮流说一句“我这样建议，是因为……”。把两人的理由放在一起，再决定下一步。`,
    option_compare: `${stageHint}可以各自提出一个做法，并一起比较它们对当前任务的一个好处和一个限制，再作选择。`,
    driver_navigator_check: `${stageHint}可以把操作和观察配合起来：Driver先说准备修改哪里，Navigator补充一个检查点；确认后再动手。`,
    two_voice_checkpoint: `${stageHint}可以先暂停修改，请两位同学各说一个下一步建议，再共同选出这轮先尝试的一项。`,
    hypothesis_test: `${stageHint}可以先一起选一个最值得检查的问题：一人提出可能原因，另一人设计一个小验证，再看预览结果。`,
    smallest_reproduction: `${stageHint}不妨先把问题缩小到最小的一处：一位同学定位现象，另一位只改一个变量，然后一起核对结果。`,
    adopt_or_reject: `${stageHint}如果刚参考了琳琳的建议，请你们先各自指出一处准备采用或暂不采用的内容，并用预览验证。`,
    claim_evidence_check: `${stageHint}可以从琳琳的建议中选出一个关键判断，一位同学说明依据，另一位用代码或预览结果核对它。`,
    keep_change: `${stageHint}请你们各自说出这一轮最有用的一点，以及下一轮想继续保留的协作方式。`,
    event_learning: `${stageHint}可以一起回看刚才的一个关键时刻：发生了什么、你们怎样处理、下次遇到类似情况准备怎么做。`,
  };
  return prompts[normalizedStrategy];
}

// A support plan is the explicit boundary between sensing and delivery. It keeps
// private evidence out of the public message while retaining a reproducible trace.
export function buildCollaborationSupportPlan({
  supportNeed,
  taskStage,
  memories = [],
} = {}) {
  const normalizedNeed = normalizeSupportNeed(supportNeed);
  const strategy = selectSupportStrategy(normalizedNeed, memories);
  return {
    schemaVersion: 1,
    supportNeed: normalizedNeed,
    strategyKey: strategy.strategyKey,
    memoryPolicy: strategy.memoryPolicy,
    shouldDeliver: true,
    skipReason: "",
    publicPrompt: buildFriendlySupportPrompt({
      supportNeed: normalizedNeed,
      taskStage,
      strategyKey: strategy.strategyKey,
    }),
    memoryIds: (Array.isArray(memories) ? memories : [])
      .map((memory) => safeText(memory?._id || memory?.id, 100))
      .filter(Boolean)
      .slice(0, 5),
  };
}

export function normalizePublicCollaborationIntervention(doc) {
  if (!doc) return null;
  const supportNeed = normalizeSupportNeed(
    doc?.supportNeed,
    deriveSupportNeedFromTrigger(doc?.triggerType),
  );
  return {
    id: safeText(doc?._id || doc?.id, 100),
    supportNeed,
    prompt: safeText(doc?.prompt, 800),
    feedback: safeText(doc?.feedback, 20),
    feedbackNote: safeText(doc?.feedbackNote, 500),
    feedbackByUserId: safeText(doc?.feedbackByUserId, 100),
    feedbackAt: safeIsoDate(doc?.feedbackAt),
    createdAt: safeIsoDate(doc?.createdAt),
  };
}
