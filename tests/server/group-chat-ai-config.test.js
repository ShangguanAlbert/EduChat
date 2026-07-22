import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GROUP_CHAT_AI_CONFIG,
  sanitizeGroupChatAiConfig,
  toGroupChatAiRuntimeConfig,
} from "../../server/services/group-chat-ai-config.js";

test("group-chat AI config defaults to Aliyun and rejects non-Aliyun providers", () => {
  const config = sanitizeGroupChatAiConfig({
    provider: "packycode",
    model: "",
    protocol: "invalid",
  });

  assert.deepEqual(config, DEFAULT_GROUP_CHAT_AI_CONFIG);
  assert.match(config.systemPrompt, /苏格拉底式 Python 学习导师/);
  assert.match(config.systemPrompt, /不要一次性给出完整程序/);
});

test("group-chat AI config preserves an Aliyun model, protocol, and prompt", () => {
  const config = sanitizeGroupChatAiConfig({
    provider: "aliyun",
    model: "qwen3.7-plus",
    protocol: "dashscope",
    systemPrompt: "请用适合学生的语言回答。",
  });
  const runtime = toGroupChatAiRuntimeConfig(config);

  assert.equal(runtime.provider, "aliyun");
  assert.equal(runtime.model, "qwen3.7-plus");
  assert.equal(runtime.protocol, "dashscope");
  assert.equal(runtime.enableThinking, false);
  assert.equal(runtime.preventPromptLeak, true);
});
