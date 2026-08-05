import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceGroupChatAiSocraticResponse,
  isGroupChatAiCompleteSolutionOutput,
  splitGroupChatAiResponseBubbles,
} from "../../server/services/group-chat-ai-response-policy.js";

test("group-chat response policy allows Socratic explanations and local syntax examples", () => {
  const content = "这个报错说明类型不符合预期。你可以先试一行 print(type(变量))，再告诉我输出。";
  assert.equal(isGroupChatAiCompleteSolutionOutput(content), false);
  assert.equal(enforceGroupChatAiSocraticResponse(content), content);
});

test("group-chat response policy replaces complete code solutions with a Socratic fallback", () => {
  const content = [
    "total = 0",
    "for value in scores:",
    "  total += value",
    "print(total / len(scores))",
  ].join("\n");
  assert.equal(isGroupChatAiCompleteSolutionOutput(content), true);
  assert.match(enforceGroupChatAiSocraticResponse(content), /接近完整作品/);
});

test("group-chat response policy splits natural paragraphs into message bubbles", () => {
  const bubbles = splitGroupChatAiResponseBubbles(
    "结构没有错误。\n\n`margin: 0 auto` 会让卡片居中。\n\n下一步先刷新预览，观察左右留白。",
  );

  assert.deepEqual(bubbles, [
    "结构没有错误。",
    "`margin: 0 auto` 会让卡片居中。",
    "下一步先刷新预览，观察左右留白。",
  ]);
});

test("group-chat response policy keeps fenced code together", () => {
  const bubbles = splitGroupChatAiResponseBubbles(
    "可以先改这一处。\n\n```css\n.card {\n\n  padding: 24px;\n}\n```\n\n刷新后比较间距。",
  );

  assert.equal(bubbles.length, 3);
  assert.match(bubbles[1], /padding: 24px/);
  assert.match(bubbles[1], /\n\n/);
});
