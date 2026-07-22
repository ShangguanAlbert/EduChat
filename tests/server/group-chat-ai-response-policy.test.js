import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceGroupChatAiSocraticResponse,
  isGroupChatAiCompleteSolutionOutput,
} from "../../server/services/group-chat-ai-response-policy.js";

test("group-chat response policy allows Socratic explanations and local syntax examples", () => {
  const content = "这个报错说明类型不符合预期。你可以先试一行 print(type(变量))，再告诉我输出。";
  assert.equal(isGroupChatAiCompleteSolutionOutput(content), false);
  assert.equal(enforceGroupChatAiSocraticResponse(content), content);
});

test("group-chat response policy replaces multi-step Python solutions with a Socratic fallback", () => {
  const content = [
    "total = 0",
    "for value in scores:",
    "  total += value",
    "print(total / len(scores))",
  ].join("\n");
  assert.equal(isGroupChatAiCompleteSolutionOutput(content), true);
  assert.match(enforceGroupChatAiSocraticResponse(content), /接近完整解法/);
});
