import assert from "node:assert/strict";
import test from "node:test";

import {
  linkLearningEventToRecentMemoryUses,
  recordMemoryUseFeedback,
  recordPartyMemoryUses,
} from "../../server/modules/party-coding/memory-usage.js";

test("records one auditable usage per explicit memory and agent task", async () => {
  let captured = null;
  const MemoryUse = {
    async bulkWrite(operations, options) {
      captured = { operations, options };
      return { upsertedCount: operations.length, modifiedCount: 0 };
    },
  };
  const result = await recordPartyMemoryUses({
    MemoryUse,
    roomId: "room-1",
    taskId: "room-1:4",
    projectId: "room-1:4",
    memoryKind: "longitudinal",
    memories: [
      { _id: "memory-1", subjectType: "student", subjectId: "student-1" },
      { _id: "memory-2", subjectType: "pair", subjectId: "pair-1" },
    ],
    useType: "student_reply",
    groupChatAiTaskId: "task-1",
    agentMessageIds: ["message-1"],
    retrievalReason: "当前房间任务相关。",
    usedAt: new Date("2026-08-15T10:00:00.000Z"),
  });
  assert.equal(result.recorded, 2);
  assert.equal(captured.options.ordered, false);
  assert.equal(captured.operations.length, 2);
  assert.equal(
    captured.operations[0].updateOne.update.$setOnInsert.usageKey,
    "student_reply:task-1:longitudinal:memory-1",
  );
  assert.equal(
    captured.operations[0].updateOne.update.$setOnInsert.subjectId,
    "student-1",
  );
});

test("links student learning events to recent memory uses", async () => {
  let captured = null;
  const MemoryUse = {
    async updateMany(filter, update) {
      captured = { filter, update };
      return { modifiedCount: 1 };
    },
  };
  const occurredAt = new Date("2026-08-15T10:15:00.000Z");
  await linkLearningEventToRecentMemoryUses({
    MemoryUse,
    event: {
      _id: "event-1",
      roomId: "room-1",
      role: "driver",
      eventType: "code_edit",
      occurredAt,
    },
  });
  assert.equal(captured.filter.roomId, "room-1");
  assert.equal(captured.filter.usedAt.$lte.toISOString(), occurredAt.toISOString());
  assert.equal(
    captured.filter.usedAt.$gte.toISOString(),
    "2026-08-15T10:00:00.000Z",
  );
  assert.deepEqual(captured.update.$addToSet, { outcomeEventIds: "event-1" });
  assert.equal(captured.update.$set.outcomeStatus, "observed");
});

test("student correction updates the matching intervention usage outcome", async () => {
  let captured = null;
  const MemoryUse = {
    async updateMany(filter, update) {
      captured = { filter, update };
      return { modifiedCount: 1 };
    },
  };
  await recordMemoryUseFeedback({
    MemoryUse,
    interventionId: "intervention-1",
    feedback: "incorrect",
    userId: "student-1",
    feedbackAt: new Date("2026-08-15T10:20:00.000Z"),
  });
  assert.deepEqual(captured.filter, { interventionId: "intervention-1" });
  assert.equal(captured.update.$set.outcomeStatus, "unsuitable");
  assert.equal(captured.update.$set.feedback, "incorrect");
});
