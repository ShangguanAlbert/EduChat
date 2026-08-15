import assert from "node:assert/strict";
import test from "node:test";

import {
  consolidateEligibleCollaborationMemories,
  markCollaborationMemoriesUsed,
  readRelevantCollaborationMemories,
  recordHumanValidatedCollaborationMemory,
  resolveNextNightlyMemoryUpdateAt,
} from "../../server/modules/party-coding/collaboration-memory.js";

test("feedback becomes eligible at the next Shanghai 23:30 window", () => {
  assert.equal(
    resolveNextNightlyMemoryUpdateAt("2026-08-15T10:00:00.000Z").toISOString(),
    "2026-08-15T15:30:00.000Z",
  );
  assert.equal(
    resolveNextNightlyMemoryUpdateAt("2026-08-15T16:00:00.000Z").toISOString(),
    "2026-08-16T15:30:00.000Z",
  );
});

test("memory retrieval is scoped to one room and support need", async () => {
  const calls = [];
  const stored = [{ _id: "memory-1", verdict: "correct" }];
  const Memory = {
    find(filter) {
      calls.push(["find", filter]);
      return {
        sort(sort) {
          calls.push(["sort", sort]);
          return this;
        },
        limit(limit) {
          calls.push(["limit", limit]);
          return this;
        },
        async lean() {
          return stored;
        },
      };
    },
  };
  const now = new Date("2026-08-15T10:00:00.000Z");
  const result = await readRelevantCollaborationMemories({
    Memory,
    roomId: " room-1 ",
    supportNeed: "role_coordination",
    now,
  });

  assert.deepEqual(result, stored);
  assert.deepEqual(calls[0], ["find", {
    roomId: "room-1",
    scope: "room",
    supportNeed: "role_coordination",
    expiresAt: { $gt: now },
  }]);
  assert.deepEqual(calls[2], ["limit", 5]);
});

test("validated feedback stores a pending nightly candidate", async () => {
  let captured = null;
  const Candidate = {
    findOneAndUpdate(filter, update, options) {
      captured = { filter, update, options };
      return {
        async lean() {
          return { _id: "memory-1" };
        },
      };
    },
  };
  const now = new Date("2026-08-15T10:00:00.000Z");
  const result = await recordHumanValidatedCollaborationMemory({
    Candidate,
    intervention: {
      _id: "intervention-1",
      roomId: "room-1",
      taskStage: "build",
      triggerType: "participation_imbalance",
      supportNeed: "role_coordination",
      orchestration: {
        strategyKey: "two_voice_checkpoint",
        memoryIds: ["prior-memory-1"],
      },
    },
    feedback: "incorrect",
    userId: "student-1",
    note: "我们刚才已经讨论过了。",
    now,
  });

  assert.equal(result._id, "memory-1");
  assert.deepEqual(captured.filter, { sourceInterventionId: "intervention-1" });
  assert.equal(captured.update.$setOnInsert.scope, "room");
  assert.equal(captured.update.$setOnInsert.strategyKey, "two_voice_checkpoint");
  assert.deepEqual(captured.update.$setOnInsert.appliedMemoryIds, ["prior-memory-1"]);
  assert.equal(captured.update.$setOnInsert.verdict, "incorrect");
  assert.equal(captured.update.$setOnInsert.validatedAt.toISOString(), now.toISOString());
  assert.equal(captured.update.$setOnInsert.eligibleAt.toISOString(), "2026-08-15T15:30:00.000Z");
  assert.equal(captured.update.$setOnInsert.status, "pending");
  assert.equal(captured.options.upsert, true);
});

test("invalid feedback cannot become collaboration memory", async () => {
  let wrote = false;
  const Candidate = {
    findOneAndUpdate() {
      wrote = true;
    },
  };
  const result = await recordHumanValidatedCollaborationMemory({
    Candidate,
    intervention: { _id: "intervention-1", roomId: "room-1" },
    feedback: "maybe",
  });
  assert.equal(result, null);
  assert.equal(wrote, false);
});

test("nightly consolidation promotes a pending candidate into active memory", async () => {
  const candidateUpdates = [];
  let memoryUpdate = null;
  const candidate = {
    _id: "candidate-1",
    roomId: "room-1",
    supportNeed: "role_coordination",
    strategyKey: "driver_navigator_check",
    verdict: "correct",
    validatedAt: new Date("2026-08-15T09:00:00.000Z"),
  };
  const Candidate = {
    find() {
      return {
        sort() { return this; },
        limit() { return this; },
        async lean() { return [candidate]; },
      };
    },
    async updateOne(filter, update) {
      candidateUpdates.push({ filter, update });
    },
  };
  const Memory = {
    findOne() {
      return { async lean() { return null; } };
    },
    findOneAndUpdate(filter, update, options) {
      memoryUpdate = { filter, update, options };
      return { async lean() { return { _id: "memory-1" }; } };
    },
  };

  const result = await consolidateEligibleCollaborationMemories({
    Candidate,
    Memory,
    now: new Date("2026-08-15T15:40:00.000Z"),
  });
  assert.deepEqual(result, { candidates: 1 });
  assert.equal(memoryUpdate.update.$set.correctCount, 1);
  assert.equal(memoryUpdate.update.$set.verdict, "correct");
  assert.deepEqual(memoryUpdate.update.$addToSet, { sourceCandidateIds: "candidate-1" });
  assert.equal(candidateUpdates[0].update.$set.status, "consolidated");
});

test("memory usage counters are updated only for explicit memory ids", async () => {
  let captured = null;
  const Memory = {
    async updateMany(filter, update) {
      captured = { filter, update };
      return { modifiedCount: 2 };
    },
  };
  const now = new Date("2026-08-15T10:00:00.000Z");
  const result = await markCollaborationMemoriesUsed({
    Memory,
    memoryIds: ["memory-1", "", "memory-2"],
    now,
  });
  assert.equal(result.modifiedCount, 2);
  assert.deepEqual(captured.filter, {
    _id: { $in: ["memory-1", "memory-2"] },
  });
  assert.equal(captured.update.$inc.useCount, 1);
  assert.equal(captured.update.$set.lastUsedAt.toISOString(), now.toISOString());
});
