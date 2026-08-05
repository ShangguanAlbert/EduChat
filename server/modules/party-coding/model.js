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
      targetUserId: { type: String, default: "" },
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
