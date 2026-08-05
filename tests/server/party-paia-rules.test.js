import assert from "node:assert/strict";
import test from "node:test";

import { detectPaiaIntervention } from "../../server/modules/party-coding/learning-service.js";

const NOW = Date.parse("2026-08-05T04:00:00.000Z");

function event(eventType, userId, secondsAgo, metadata = {}) {
  return {
    eventType,
    userId,
    metadata,
    occurredAt: new Date(NOW - secondsAgo * 1000),
  };
}

test("detectPaiaIntervention identifies sustained one-person editing", () => {
  const decision = detectPaiaIntervention([
    event("code_edit", "student-1", 80),
    event("code_edit", "student-1", 60),
    event("code_edit", "student-1", 40),
    event("code_edit", "student-1", 20),
  ], {
    driverUserId: "student-1",
    navigatorUserId: "student-2",
    memberNames: { "student-2": "小李" },
  }, NOW);

  assert.equal(decision.triggerType, "participation_imbalance");
  assert.equal(decision.targetUserId, "student-2");
  assert.match(decision.prompt, /小李/);
});

test("detectPaiaIntervention asks for reasons after unsupported quick agreement", () => {
  const decision = detectPaiaIntervention([
    event("chat_message", "student-1", 40, { content: "我们就用网格布局吧" }),
    event("chat_message", "student-2", 10, { content: "可以" }),
  ], {}, NOW);

  assert.equal(decision.triggerType, "quick_agreement");
  assert.match(decision.prompt, /分别/);
});

test("detectPaiaIntervention stays quiet during balanced discussion and editing", () => {
  const decision = detectPaiaIntervention([
    event("chat_message", "student-1", 60, { content: "因为卡片要自动换行，我建议网格布局" }),
    event("chat_message", "student-2", 50, { content: "我认为弹性布局更容易控制间距" }),
    event("code_edit", "student-1", 40),
    event("code_edit", "student-2", 30),
  ], {
    driverUserId: "student-1",
    navigatorUserId: "student-2",
  }, NOW);

  assert.equal(decision, null);
});
