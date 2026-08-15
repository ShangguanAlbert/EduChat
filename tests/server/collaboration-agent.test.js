import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollaborationSupportPlan,
  buildFriendlySupportPrompt,
  deriveSupportNeedFromParticipation,
  deriveSupportNeedFromTrigger,
  normalizePublicCollaborationIntervention,
} from "../../server/modules/party-coding/collaboration-agent.js";

test("participation reasons are translated into group support needs", () => {
  assert.equal(
    deriveSupportNeedFromParticipation(["one_sided_decision_making"]),
    "mutual_explanation",
  );
  assert.equal(
    deriveSupportNeedFromParticipation(["silent_partner"]),
    "role_coordination",
  );
});

test("legacy intervention triggers map to the corresponding support need", () => {
  assert.equal(deriveSupportNeedFromTrigger("quick_agreement"), "mutual_explanation");
  assert.equal(deriveSupportNeedFromTrigger("repeated_trial"), "productive_debugging");
  assert.equal(deriveSupportNeedFromTrigger("ai_answer_adoption"), "ai_verification");
});

test("public prompts invite a group action without exposing a diagnosis", () => {
  const prompt = buildFriendlySupportPrompt({
    supportNeed: "role_coordination",
    taskStage: "build",
  });
  assert.match(prompt, /Driver/);
  assert.match(prompt, /Navigator/);
  assert.doesNotMatch(prompt, /参与不足|沉默|监测|判断依据|目标学生/);
});

test("an older rejected strategy changes the next public support action", () => {
  const plan = buildCollaborationSupportPlan({
    supportNeed: "role_coordination",
    taskStage: "build",
    memories: [{
      id: "memory-1",
      supportNeed: "role_coordination",
      strategyKey: "driver_navigator_check",
      verdict: "incorrect",
      validatedAt: "2026-08-14T10:00:00.000Z",
    }],
  });
  assert.equal(plan.shouldDeliver, true);
  assert.equal(plan.strategyKey, "two_voice_checkpoint");
  assert.equal(plan.memoryPolicy, "avoid_rejected_strategy");
  assert.match(plan.publicPrompt, /两位同学各说一个下一步建议/);
});

test("a validated strategy is reused in a similar support situation", () => {
  const plan = buildCollaborationSupportPlan({
    supportNeed: "mutual_explanation",
    memories: [{
      id: "memory-2",
      supportNeed: "mutual_explanation",
      strategyKey: "option_compare",
      verdict: "correct",
      validatedAt: "2026-08-14T10:00:00.000Z",
    }],
  });
  assert.equal(plan.strategyKey, "option_compare");
  assert.equal(plan.memoryPolicy, "reuse_validated_strategy");
  assert.match(plan.publicPrompt, /各自提出一个做法/);
});

test("student payload never contains private sensing evidence", () => {
  const payload = normalizePublicCollaborationIntervention({
    _id: "intervention-1",
    supportNeed: "role_coordination",
    prompt: "请你们一起确认下一步。",
    evidenceSummary: "一名学生持续没有发言。",
    targetUserId: "student-2",
    participationAnalysis: { confidence: 0.92 },
    orchestration: { strategyKey: "driver_navigator_check" },
  });
  assert.equal(payload.prompt, "请你们一起确认下一步。");
  assert.equal("evidenceSummary" in payload, false);
  assert.equal("targetUserId" in payload, false);
  assert.equal("participationAnalysis" in payload, false);
  assert.equal("orchestration" in payload, false);
  assert.equal("strategyKey" in payload, false);
});

test("public payload ignores invalid stored timestamps", () => {
  const payload = normalizePublicCollaborationIntervention({
    id: "intervention-2",
    prompt: "请你们一起确认下一步。",
    feedbackAt: "not-a-date",
    createdAt: "also-not-a-date",
  });
  assert.equal(payload.feedbackAt, "");
  assert.equal(payload.createdAt, "");
});
