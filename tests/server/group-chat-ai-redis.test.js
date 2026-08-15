import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  attachGroupChatAiRedisLifecycleLogging,
  releaseGroupChatAiRunningCapacity,
  releaseLongitudinalMemoryNightlyLock,
  releasePartyParticipationRoomLock,
  releasePartyParticipationRunningCapacity,
  tryAcquireGroupChatAiRunningCapacity,
  tryAcquireLongitudinalMemoryNightlyLock,
  tryAcquirePartyParticipationRoomLock,
  tryAcquirePartyParticipationRunningCapacity,
} from "../../server/runtime/group-chat-ai-redis.js";

test("attachGroupChatAiRedisLifecycleLogging throttles repeated redis connection errors and resets after ready", () => {
  const redis = new EventEmitter();
  const warnings = [];
  const infos = [];
  const logger = {
    warn: (...args) => warnings.push(args),
    info: (...args) => infos.push(args),
  };

  attachGroupChatAiRedisLifecycleLogging(redis, {
    logger,
    connectionName: "group-chat-ai-events",
    redisUrl: "redis://127.0.0.1:6380",
  });

  const error = new Error("connect ECONNREFUSED 127.0.0.1:6380");
  redis.emit("error", error);
  redis.emit("error", error);

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /group-chat-ai-events/);
  assert.match(String(warnings[0][0]), /redis:\/\/127\.0\.0\.1:6380/);
  assert.equal(warnings[0][1], error);

  redis.emit("ready");
  assert.equal(infos.length, 1);
  assert.match(String(infos[0][0]), /group-chat-ai-events/);

  redis.emit("error", error);
  assert.equal(warnings.length, 2);
});

test("attachGroupChatAiRedisLifecycleLogging only binds one error handler per redis client", () => {
  const redis = new EventEmitter();
  const warnings = [];
  const logger = {
    warn: (...args) => warnings.push(args),
    info: () => {},
  };

  attachGroupChatAiRedisLifecycleLogging(redis, {
    logger,
    connectionName: "group-chat-ai-worker",
  });
  attachGroupChatAiRedisLifecycleLogging(redis, {
    logger,
    connectionName: "group-chat-ai-worker",
  });

  redis.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6380"));
  assert.equal(warnings.length, 1);
});

test("global Qwen semaphore caps all worker replicas at 32 running requests", async () => {
  const calls = [];
  const redis = {
    eval: async (...args) => {
      calls.push(args);
      return "accepted";
    },
  };

  const decision = await tryAcquireGroupChatAiRunningCapacity(redis, {
    prefix: "test:qwen",
    roomId: "room-1",
    userId: "user-1",
  });
  assert.equal(decision.accepted, true);
  assert.deepEqual(calls[0].slice(1), [
    3,
    "test:qwen:global:running",
    "test:qwen:room:room-1:running",
    "test:qwen:user:user-1:running",
    32,
    4,
    2,
  ]);

  await releaseGroupChatAiRunningCapacity(redis, {
    prefix: "test:qwen",
    roomId: "room-1",
    userId: "user-1",
  });
  assert.deepEqual(calls[1].slice(1), [
    3,
    "test:qwen:global:running",
    "test:qwen:room:room-1:running",
    "test:qwen:user:user-1:running",
  ]);
});

test("participation analysis uses at most 8 of the 32 global Qwen slots", async () => {
  const calls = [];
  const redis = {
    eval: async (...args) => {
      calls.push(args);
      return "accepted";
    },
  };

  const decision = await tryAcquirePartyParticipationRunningCapacity(redis, {
    prefix: "test:qwen",
  });
  assert.equal(decision.accepted, true);
  assert.deepEqual(calls[0].slice(1), [
    2,
    "test:qwen:global:running",
    "test:qwen:participation-analysis:running",
    32,
    8,
  ]);

  await releasePartyParticipationRunningCapacity(redis, {
    prefix: "test:qwen",
  });
  assert.deepEqual(calls[1].slice(1), [
    2,
    "test:qwen:global:running",
    "test:qwen:participation-analysis:running",
  ]);
});

test("participation analysis holds one running lock per room", async () => {
  const calls = [];
  const redis = {
    async set(...args) {
      calls.push(["set", ...args]);
      return "OK";
    },
    async eval(...args) {
      calls.push(["eval", ...args]);
      return 1;
    },
  };

  const acquired = await tryAcquirePartyParticipationRoomLock(redis, {
    prefix: "test:qwen",
    roomId: "room-1",
    taskId: "task-1",
    ttlMs: 90_000,
  });
  assert.equal(acquired, true);
  assert.deepEqual(calls[0].slice(1), [
    "test:qwen:participation-analysis:room:room-1:running",
    "task-1",
    "PX",
    90_000,
    "NX",
  ]);

  await releasePartyParticipationRoomLock(redis, {
    prefix: "test:qwen",
    roomId: "room-1",
    taskId: "task-1",
  });
  assert.deepEqual(calls[1].slice(2), [
    1,
    "test:qwen:participation-analysis:room:room-1:running",
    "task-1",
  ]);
});

test("nightly longitudinal memory compilation holds one cluster-wide lock", async () => {
  const calls = [];
  const redis = {
    async set(...args) {
      calls.push(["set", ...args]);
      return "OK";
    },
    async eval(...args) {
      calls.push(["eval", ...args]);
      return 1;
    },
  };
  const acquired = await tryAcquireLongitudinalMemoryNightlyLock(redis, {
    prefix: "test:qwen",
    ownerId: "worker-1",
    ttlMs: 300_000,
  });
  assert.equal(acquired, true);
  assert.deepEqual(calls[0].slice(1), [
    "test:qwen:longitudinal-memory:nightly:running",
    "worker-1",
    "PX",
    300_000,
    "NX",
  ]);
  await releaseLongitudinalMemoryNightlyLock(redis, {
    prefix: "test:qwen",
    ownerId: "worker-1",
  });
  assert.deepEqual(calls[1].slice(2), [
    1,
    "test:qwen:longitudinal-memory:nightly:running",
    "worker-1",
  ]);
});
