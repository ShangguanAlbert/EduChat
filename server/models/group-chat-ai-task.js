import mongoose from "mongoose";

const groupChatAiTaskSchema = new mongoose.Schema(
  {
    taskKind: {
      type: String,
      enum: ["student_reply", "participation_analysis"],
      default: "student_reply",
      index: true,
    },
    roomId: { type: String, required: true, index: true },
    triggerMessageId: { type: String, required: true, unique: true, index: true },
    placeholderMessageId: { type: String, default: "", index: true },
    requestedByUserId: { type: String, required: true, index: true },
    requestedByUserName: { type: String, default: "" },
    agentId: { type: String, default: "A" },
    provider: { type: String, default: "aliyun" },
    model: { type: String, default: "qwen3.7-plus" },
    status: {
      type: String,
      enum: ["pending", "running", "done", "failed"],
      default: "pending",
      index: true,
    },
    contextSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    attachmentRefs: {
      type: [mongoose.Schema.Types.Mixed],
      default: () => [],
    },
    queueJobId: { type: String, default: "" },
    leaseUntil: { type: Date, default: null },
    dequeuedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    attemptCount: { type: Number, default: 0 },
    lastQueuedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "group_chat_ai_tasks",
  },
);

groupChatAiTaskSchema.index(
  { status: 1, createdAt: 1 },
  { name: "ix_group_chat_ai_tasks_status_created" },
);

groupChatAiTaskSchema.index(
  { roomId: 1, status: 1, createdAt: 1 },
  { name: "ix_group_chat_ai_tasks_room_status_created" },
);

groupChatAiTaskSchema.index(
  { requestedByUserId: 1, status: 1, createdAt: 1 },
  { name: "ix_group_chat_ai_tasks_user_status_created" },
);

export const GroupChatAiTask =
  mongoose.models.GroupChatAiTask ||
  mongoose.model("GroupChatAiTask", groupChatAiTaskSchema);
