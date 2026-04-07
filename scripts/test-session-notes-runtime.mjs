import assert from "node:assert/strict";

import {
  SESSION_NOTES_MAX_ESTIMATED_TOKENS,
  buildChatRequestPayload,
  buildMessagesBeforeRecentTurns,
  buildSessionNotesPrompt,
  buildSessionRecentTurnsFromMessages,
  computePackySafeMaxOutputTokens,
  estimateSessionNotesTokens,
  extractSessionNoteFileEntriesFromContent,
  extractUnsummarizedMessages,
  fitSessionNotesToTokenBudget,
  hasUnsummarizedOlderMessages,
  resolvePackyRequestedMaxOutputTokens,
  shouldCompactSessionNotesContext,
} from "../server/services/core-runtime.js";

function runCase(name, runner) {
  try {
    runner();
    console.log(`✅ ${name}`);
    return { name, ok: true, detail: "passed" };
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error?.message || error}`);
    return { name, ok: false, detail: error?.message || String(error) };
  }
}

function createMessage(id, role, content, extra = {}) {
  return {
    id,
    role,
    content,
    createdAt: extra.createdAt || "2026-04-06T00:00:00.000Z",
    ...extra,
  };
}

const results = [];

results.push(
  runCase("notes 超长时会被裁到预算内", () => {
    const hugeNotes = {
      goal: "完成 EduChat 的上下文压缩重构。".repeat(120),
      facts: Array.from({ length: 60 }, (_, index) => `事实 ${index + 1}：${"很长的说明".repeat(30)}`),
      preferences: Array.from({ length: 30 }, (_, index) => `偏好 ${index + 1}：${"简洁但准确".repeat(20)}`),
      completed: Array.from({ length: 30 }, (_, index) => `已完成 ${index + 1}：${"内容".repeat(30)}`),
      pending: Array.from({ length: 30 }, (_, index) => `待办 ${index + 1}：${"内容".repeat(30)}`),
      openQuestions: Array.from({ length: 30 }, (_, index) => `问题 ${index + 1}：${"内容".repeat(30)}`),
      doNotRepeat: Array.from({ length: 30 }, (_, index) => `避免 ${index + 1}：${"内容".repeat(30)}`),
      fileSummaries: Array.from({ length: 20 }, (_, index) => ({
        filename: `file-${index + 1}.txt`,
        summary: `摘要 ${index + 1}：${"原文片段".repeat(80)}`,
        keyPoints: Array.from({ length: 10 }, (__, innerIndex) => `关键点 ${innerIndex + 1}：${"细节".repeat(20)}`),
      })),
    };

    const fitted = fitSessionNotesToTokenBudget(hugeNotes);
    const tokenEstimate = estimateSessionNotesTokens(fitted);

    assert.ok(
      tokenEstimate <= SESSION_NOTES_MAX_ESTIMATED_TOKENS,
      `tokenEstimate=${tokenEstimate} 超过上限 ${SESSION_NOTES_MAX_ESTIMATED_TOKENS}`,
    );
  }),
);

results.push(
  runCase("notes prompt 只保留结构化摘要，不回灌原始附件文本", () => {
    const prompt = buildSessionNotesPrompt({
      goal: "修复 PackyCode 上下文压缩",
      fileSummaries: [
        {
          filename: "spec.md",
          summary: "记录了 session notes 架构与压缩策略。",
          keyPoints: ["只注入摘要", "不要重复原文"],
        },
      ],
      facts: ["先压缩再发主请求"],
    });

    assert.ok(prompt.includes("文件摘要"), "缺少文件摘要段落");
    assert.ok(prompt.includes("spec.md"), "缺少文件名");
    assert.ok(prompt.includes("只注入摘要"), "缺少关键点");
    assert.ok(!prompt.includes("内容预览:"), "不应包含原始附件预览标记");
  }),
);

results.push(
  runCase("Packy 输出预算会按剩余窗口收缩", () => {
    const requested = resolvePackyRequestedMaxOutputTokens({
      maxOutputTokens: 256000,
    });
    const safe = computePackySafeMaxOutputTokens({
      estimatedInputTokens: 974000,
      requestedMaxOutputTokens: requested,
      contextWindowTokens: 1000000,
    });

    assert.equal(requested, 256000);
    assert.equal(safe, 14000);
    assert.equal(
      shouldCompactSessionNotesContext({
        estimatedInputTokens: 974000,
        requestedMaxOutputTokens: requested,
        contextWindowTokens: 1000000,
      }),
      true,
    );
  }),
);

results.push(
  runCase("chat payload 会把动态安全输出写入 max_tokens", () => {
    const payload = buildChatRequestPayload({
      model: "gpt-5.4",
      messages: [createMessage("m1", "user", "hello")],
      systemPrompt: "system",
      provider: "packycode",
      config: { maxOutputTokens: 14000 },
      reasoning: { enabled: true, effort: "medium" },
    });

    assert.equal(payload.max_tokens, 14000);
    assert.equal(payload.messages[0].role, "system");
    assert.equal(payload.messages[1].role, "user");
  }),
);

results.push(
  runCase("older messages 会在有 cutoff 时只提取未摘要部分", () => {
    const messages = [
      createMessage("m1", "user", "最早问题"),
      createMessage("m2", "assistant", "最早回答"),
      createMessage("m3", "user", "后续问题"),
      createMessage("m4", "assistant", "后续回答"),
    ];
    const recentTurns = messages.slice(2);
    const older = buildMessagesBeforeRecentTurns(messages, recentTurns);
    const unsummarized = extractUnsummarizedMessages(older, "m1");

    assert.deepEqual(
      older.map((item) => item.id),
      ["m1", "m2"],
    );
    assert.deepEqual(
      unsummarized.map((item) => item.id),
      ["m2"],
    );
    assert.equal(hasUnsummarizedOlderMessages(older, "m1"), true);
    assert.equal(hasUnsummarizedOlderMessages(older, "m2"), false);
  }),
);

results.push(
  runCase("仅写入文件摘要时，older history 仍会被识别为未压缩", () => {
    const messages = [
      createMessage("m1", "user", "第一轮"),
      createMessage("m2", "assistant", "第一轮回答"),
      createMessage("m3", "user", "第二轮"),
      createMessage("m4", "assistant", "第二轮回答"),
      createMessage("m5", "user", "当前提问"),
    ];
    const recentTurns = buildSessionRecentTurnsFromMessages(messages.slice(-2));
    assert.equal(recentTurns.length > 0, true);

    const older = buildMessagesBeforeRecentTurns(messages, messages.slice(-2));
    assert.deepEqual(
      older.map((item) => item.id),
      ["m1", "m2", "m3"],
    );
    assert.equal(
      hasUnsummarizedOlderMessages(older, ""),
      true,
      "没有 summaryUpToMessageId 时，older history 不应被误判为已压缩",
    );
  }),
);

results.push(
  runCase("附件上下文会抽取成文件摘要条目", () => {
    const entries = extractSessionNoteFileEntriesFromContent([
      {
        type: "text",
        text: [
          "[附件: design-spec.md]",
          "MIME: text/markdown",
          "内容预览:",
          "这里记录了 A+B 架构、session notes、recentTurns 和 file summaries。",
        ].join("\n"),
      },
    ]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].filename, "design-spec.md");
    assert.ok(entries[0].summary.includes("A+B 架构"));
    assert.ok(entries[0].keyPoints.length > 0);
  }),
);

console.log("\n=== Summary ===");
const failed = results.filter((item) => !item.ok);
results.forEach((item, index) => {
  console.log(`${index + 1}. ${item.ok ? "PASS" : "FAIL"} | ${item.name}`);
});

if (failed.length > 0) {
  console.error(`\n结论：${failed.length} 项失败。`);
  process.exitCode = 1;
} else {
  console.log("\n结论：本地 session-notes 相关断言全部通过。");
}
