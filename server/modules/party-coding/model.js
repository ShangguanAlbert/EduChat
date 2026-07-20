export function getPartyCodingWorkspaceModel(mongoose) {
  const versionSchema = new mongoose.Schema(
    {
      revision: { type: Number, required: true },
      code: { type: String, default: "" },
      savedByUserId: { type: String, default: "" },
      savedByName: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
    },
    { _id: false },
  );
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, unique: true, index: true },
      code: { type: String, default: "print('你好，Python！')\n" },
      collaborationState: { type: Buffer, default: null },
      stdin: { type: String, default: "" },
      revision: { type: Number, default: 1 },
      versions: { type: [versionSchema], default: () => [] },
      run: {
        status: { type: String, enum: ["idle", "running"], default: "idle" },
        runId: { type: String, default: "" },
        startedAt: { type: Date, default: null },
        startedByUserId: { type: String, default: "" },
        startedByName: { type: String, default: "" },
        stdout: { type: String, default: "" },
        stderr: { type: String, default: "" },
        exitCode: { type: Number, default: null },
        durationMs: { type: Number, default: null },
        completedAt: { type: Date, default: null },
      },
    },
    { timestamps: true, collection: "party_coding_workspaces" },
  );
  return mongoose.models.PartyCodingWorkspace || mongoose.model("PartyCodingWorkspace", schema);
}

export function getPartyCodingRunLogModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      roomId: { type: String, required: true, index: true },
      runId: { type: String, required: true, unique: true, index: true },
      teacherScopeKey: { type: String, required: true, index: true },
      startedByUserId: { type: String, default: "", index: true },
      startedByName: { type: String, default: "成员" },
      codeSha256: { type: String, default: "" },
      codeLength: { type: Number, default: 0 },
      stdinLength: { type: Number, default: 0 },
      status: {
        type: String,
        enum: [
          "succeeded",
          "failed",
          "timed_out",
          "queue_full",
          "scheduler_unavailable",
          "runner_unavailable",
        ],
        required: true,
        index: true,
      },
      exitCode: { type: Number, default: null },
      durationMs: { type: Number, default: 0 },
      queueWaitMs: { type: Number, default: 0 },
      errorSummary: { type: String, default: "" },
      startedAt: { type: Date, required: true, index: true },
      completedAt: { type: Date, required: true },
      expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
      },
    },
    { timestamps: true, collection: "party_coding_run_logs" },
  );
  schema.index({ teacherScopeKey: 1, startedAt: -1 });
  schema.index({ roomId: 1, startedAt: -1 });
  return mongoose.models.PartyCodingRunLog || mongoose.model("PartyCodingRunLog", schema);
}
