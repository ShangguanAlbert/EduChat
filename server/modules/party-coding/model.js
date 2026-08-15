const DEFAULT_HTML = `<main class="page-card">
  <h1>我们的网页作品</h1>
  <p>请和同伴一起修改 HTML 与 CSS，然后刷新预览。</p>
</main>
`;

const DEFAULT_CSS = `body {
  margin: 0;
  padding: 32px;
  font-family: system-ui, sans-serif;
  background: #f7f3ea;
  color: #2f2a24;
}

.page-card {
  max-width: 680px;
  margin: 0 auto;
  padding: 32px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 12px 36px rgba(77, 61, 42, 0.12);
}
`;

export const PARTY_WEB_DEFAULTS = Object.freeze({
  html: DEFAULT_HTML,
  css: DEFAULT_CSS,
  taskStage: "understand",
});

const TASK_STAGES = ["understand", "plan", "build", "debug", "reflect"];
const LEARNING_EVENT_TYPES = [
  "chat_message",
  "code_edit",
  "preview",
  "diagnostic_error",
  "task_switch",
  "task_stage_change",
  "role_rotation",
  "paia_intervention",
  "paia_feedback",
];

export function getPartyWebWorkspaceModel(mongoose) {
  const versionSchema = new mongoose.Schema(
    {
      revision: { type: Number, required: true },
      html: { type: String, default: "" },
      css: { type: String, default: "" },
      savedByUserId: { type: String, default: "" },
      savedByName: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
    },
    { _id: false },
  );
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, unique: true, index: true },
      html: { type: String, default: DEFAULT_HTML },
      css: { type: String, default: DEFAULT_CSS },
      collaborationState: { type: Buffer, default: null },
      revision: { type: Number, default: 1 },
      taskRevision: { type: Number, default: 1 },
      versions: { type: [versionSchema], default: () => [] },
      taskStage: { type: String, enum: TASK_STAGES, default: "understand" },
      driverUserId: { type: String, default: "", index: true },
      navigatorUserId: { type: String, default: "", index: true },
      roleRotationCount: { type: Number, default: 0 },
      rolesUpdatedAt: { type: Date, default: null },
      lastPreviewAt: { type: Date, default: null },
      lastPreviewByUserId: { type: String, default: "" },
      lastDiagnostics: { type: [String], default: () => [] },
    },
    { timestamps: true, collection: "party_web_workspaces" },
  );
  return mongoose.models.PartyWebWorkspace || mongoose.model("PartyWebWorkspace", schema);
}

export function getPartyLearningEventModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, index: true },
      taskId: { type: String, default: "", index: true },
      taskStage: { type: String, enum: TASK_STAGES, default: "understand", index: true },
      userId: { type: String, default: "", index: true },
      userName: { type: String, default: "成员" },
      role: { type: String, enum: ["driver", "navigator", "observer", "paia"], default: "observer" },
      eventType: { type: String, enum: LEARNING_EVENT_TYPES, required: true, index: true },
      metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      occurredAt: { type: Date, default: Date.now, required: true, index: true },
    },
    { timestamps: true, collection: "party_learning_events" },
  );
  schema.index({ roomId: 1, occurredAt: -1 });
  schema.index({ roomId: 1, eventType: 1, occurredAt: -1 });
  return mongoose.models.PartyLearningEvent || mongoose.model("PartyLearningEvent", schema);
}

export function getPartyPaiaInterventionModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, index: true },
      taskId: { type: String, default: "", index: true },
      taskStage: { type: String, enum: TASK_STAGES, default: "understand" },
      triggerType: {
        type: String,
        enum: ["participation_imbalance", "quick_agreement", "repeated_trial", "ai_answer_adoption"],
        required: true,
        index: true,
      },
      evidenceSummary: { type: String, required: true },
      prompt: { type: String, required: true },
      supportNeed: {
        type: String,
        enum: [
          "shared_goal",
          "mutual_explanation",
          "role_coordination",
          "productive_debugging",
          "ai_verification",
          "reflection",
        ],
        default: "role_coordination",
        index: true,
      },
      targetUserId: { type: String, default: "" },
      participationAnalysis: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      orchestration: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      feedback: { type: String, enum: ["", "correct", "partial", "incorrect"], default: "" },
      feedbackNote: { type: String, default: "" },
      feedbackByUserId: { type: String, default: "" },
      feedbackAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true, collection: "party_paia_interventions" },
  );
  schema.index({ roomId: 1, createdAt: -1 });
  return mongoose.models.PartyPaiaIntervention || mongoose.model("PartyPaiaIntervention", schema);
}

export function getPartyCollaborationMemoryModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, index: true },
      scope: { type: String, enum: ["room"], default: "room", required: true },
      memoryType: { type: String, enum: ["intervention_feedback"], required: true },
      supportNeed: { type: String, required: true, index: true },
      strategyKey: { type: String, required: true },
      verdict: { type: String, enum: ["correct", "partial", "incorrect"], required: true },
      correctCount: { type: Number, default: 0 },
      partialCount: { type: Number, default: 0 },
      incorrectCount: { type: Number, default: 0 },
      sourceCandidateIds: { type: [String], default: () => [] },
      lastValidatedAt: { type: Date, required: true, index: true },
      consolidatedAt: { type: Date, required: true, index: true },
      useCount: { type: Number, default: 0 },
      lastUsedAt: { type: Date, default: null },
      expiresAt: { type: Date, required: true },
      createdAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true, collection: "party_paia_memories" },
  );
  schema.index(
    { roomId: 1, scope: 1, supportNeed: 1, strategyKey: 1 },
    { unique: true },
  );
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return mongoose.models.PartyCollaborationMemory
    || mongoose.model("PartyCollaborationMemory", schema);
}

export function getPartyCollaborationMemoryCandidateModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, index: true },
      scope: { type: String, enum: ["room"], default: "room", required: true },
      memoryType: { type: String, enum: ["intervention_feedback"], required: true },
      supportNeed: { type: String, required: true, index: true },
      strategyKey: { type: String, required: true },
      appliedMemoryIds: { type: [String], default: () => [] },
      triggerType: { type: String, default: "" },
      taskStage: { type: String, enum: TASK_STAGES, default: "understand" },
      verdict: { type: String, enum: ["correct", "partial", "incorrect"], required: true },
      summary: { type: String, required: true },
      feedbackNote: { type: String, default: "" },
      sourceInterventionId: { type: String, required: true, unique: true },
      validatedByUserId: { type: String, default: "" },
      validatedAt: { type: Date, required: true, index: true },
      eligibleAt: { type: Date, required: true, index: true },
      status: { type: String, enum: ["pending", "consolidated"], default: "pending", index: true },
      consolidatedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true, collection: "party_paia_memory_candidates" },
  );
  schema.index({ status: 1, eligibleAt: 1 });
  return mongoose.models.PartyCollaborationMemoryCandidate
    || mongoose.model("PartyCollaborationMemoryCandidate", schema);
}

const LONGITUDINAL_SUBJECT_TYPES = ["course", "project", "pair", "student", "agent"];
const LONGITUDINAL_MEMORY_TYPES = [
  "course_progress",
  "project_snapshot",
  "collaboration_pattern",
  "learning_activity",
  "knowledge_evidence",
  "ability_judgment",
  "agent_outcome",
];

const MEMORY_ALLOWED_USE_TYPES = ["student_reply", "group_intervention"];

export function getPartyLongitudinalMemoryCandidateModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      candidateKey: { type: String, required: true, unique: true, index: true },
      roomId: { type: String, required: true, index: true },
      courseId: { type: String, required: true, index: true },
      lessonId: { type: String, default: "", index: true },
      projectId: { type: String, default: "", index: true },
      subjectType: { type: String, enum: LONGITUDINAL_SUBJECT_TYPES, required: true, index: true },
      subjectId: { type: String, required: true, index: true },
      memoryType: { type: String, enum: LONGITUDINAL_MEMORY_TYPES, required: true, index: true },
      conceptKey: { type: String, default: "", index: true },
      summary: { type: String, required: true },
      payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      confidence: { type: Number, default: 0.5, min: 0, max: 1 },
      validationStatus: {
        type: String,
        enum: ["system_observed", "human_confirmed", "human_rejected"],
        default: "system_observed",
        index: true,
      },
      sourceEventIds: { type: [String], default: () => [] },
      boundaryAt: { type: Date, required: true, index: true },
      status: {
        type: String,
        enum: ["pending", "processing", "consolidated"],
        default: "pending",
        index: true,
      },
      claimedAt: { type: Date, default: null },
      consolidatedAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true, collection: "party_course_memory_candidates" },
  );
  schema.index({ status: 1, boundaryAt: 1, createdAt: 1 });
  schema.index({ courseId: 1, subjectType: 1, subjectId: 1, memoryType: 1 });
  return mongoose.models.PartyLongitudinalMemoryCandidate
    || mongoose.model("PartyLongitudinalMemoryCandidate", schema);
}

export function getPartyLongitudinalMemoryModel(mongoose) {
  const historySchema = new mongoose.Schema(
    {
      candidateId: { type: String, required: true },
      summary: { type: String, required: true },
      payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      confidence: { type: Number, default: 0.5 },
      boundaryAt: { type: Date, required: true },
    },
    { _id: false },
  );
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, index: true },
      courseId: { type: String, required: true, index: true },
      lessonId: { type: String, default: "", index: true },
      projectId: { type: String, default: "", index: true },
      subjectType: { type: String, enum: LONGITUDINAL_SUBJECT_TYPES, required: true, index: true },
      subjectId: { type: String, required: true, index: true },
      memoryType: { type: String, enum: LONGITUDINAL_MEMORY_TYPES, required: true, index: true },
      conceptKey: { type: String, default: "", index: true },
      summary: { type: String, required: true },
      payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      confidence: { type: Number, default: 0.5, min: 0, max: 1 },
      validationStatus: {
        type: String,
        enum: ["system_observed", "human_confirmed", "human_rejected"],
        default: "system_observed",
        index: true,
      },
      validationNote: { type: String, default: "" },
      validatedAt: { type: Date, default: null },
      validatedByAdminId: { type: String, default: "" },
      teacherEditedAt: { type: Date, default: null },
      teacherEditedByAdminId: { type: String, default: "" },
      retrievalEnabled: { type: Boolean, default: true, index: true },
      allowedUseTypes: {
        type: [String],
        enum: MEMORY_ALLOWED_USE_TYPES,
        default: () => ["student_reply"],
      },
      publicDisclosure: {
        type: String,
        enum: ["action_only", "summary_allowed"],
        default: "action_only",
      },
      evidenceCount: { type: Number, default: 0 },
      sourceCandidateIds: { type: [String], default: () => [] },
      history: { type: [historySchema], default: () => [] },
      lastBoundaryAt: { type: Date, required: true, index: true },
      consolidatedAt: { type: Date, required: true, index: true },
      useCount: { type: Number, default: 0 },
      lastUsedAt: { type: Date, default: null },
      expiresAt: { type: Date, required: true },
      createdAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true, collection: "party_course_memories" },
  );
  schema.index(
    {
      courseId: 1,
      subjectType: 1,
      subjectId: 1,
      memoryType: 1,
      conceptKey: 1,
    },
    { unique: true },
  );
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return mongoose.models.PartyLongitudinalMemory
    || mongoose.model("PartyLongitudinalMemory", schema);
}

export function getPartyMemoryUseModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      usageKey: { type: String, required: true, unique: true, index: true },
      roomId: { type: String, required: true, index: true },
      taskId: { type: String, default: "", index: true },
      projectId: { type: String, default: "", index: true },
      memoryKind: {
        type: String,
        enum: ["longitudinal", "collaboration"],
        required: true,
        index: true,
      },
      memoryId: { type: String, required: true, index: true },
      memoryVersion: { type: String, default: "" },
      subjectType: { type: String, default: "", index: true },
      subjectId: { type: String, default: "", index: true },
      useType: {
        type: String,
        enum: MEMORY_ALLOWED_USE_TYPES,
        required: true,
        index: true,
      },
      retrievalReason: { type: String, default: "" },
      retrievalScore: { type: Number, default: null, min: 0, max: 1 },
      groupChatAiTaskId: { type: String, default: "", index: true },
      agentMessageIds: { type: [String], default: () => [] },
      interventionId: { type: String, default: "", index: true },
      outcomeEventIds: { type: [String], default: () => [] },
      outcomeStatus: {
        type: String,
        enum: ["pending", "observed", "helpful", "partial", "unsuitable"],
        default: "pending",
        index: true,
      },
      feedback: {
        type: String,
        enum: ["", "correct", "partial", "incorrect"],
        default: "",
      },
      feedbackByUserId: { type: String, default: "" },
      feedbackAt: { type: Date, default: null },
      usedAt: { type: Date, required: true, default: Date.now, index: true },
    },
    { timestamps: true, collection: "party_memory_uses" },
  );
  schema.index({ roomId: 1, usedAt: -1 });
  schema.index({ memoryId: 1, usedAt: -1 });
  return mongoose.models.PartyMemoryUse
    || mongoose.model("PartyMemoryUse", schema);
}

export function getPartyMemoryCompilationStateModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, unique: true, index: true },
      lastBoundaryAt: { type: Date, default: null, index: true },
      lastCompiledAt: { type: Date, default: null },
      lastCandidateCount: { type: Number, default: 0 },
      lastError: { type: String, default: "" },
    },
    { timestamps: true, collection: "party_memory_compilation_states" },
  );
  return mongoose.models.PartyMemoryCompilationState
    || mongoose.model("PartyMemoryCompilationState", schema);
}
