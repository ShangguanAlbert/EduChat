import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  DEFAULT_TEACHER_SCOPE_KEY,
  buildTeacherScopedStorageUserId,
  mongoUri,
  mongoose,
  pickRecentUserRounds,
  streamAgentResponse,
} from "../server/services/core-runtime.js";

const TEST_CHAT_USER_ID = "session-notes-integration-user";
const TEST_STORAGE_USER_ID = buildTeacherScopedStorageUserId(
  TEST_CHAT_USER_ID,
  DEFAULT_TEACHER_SCOPE_KEY,
);

function createMessage(id, role, label, repeat = 12) {
  const prefix = `${label} `;
  return {
    id,
    role,
    content: `${prefix}${"上下文内容".repeat(repeat)}`,
    createdAt: "2026-04-06T00:00:00.000Z",
  };
}

function createConversation({
  totalRounds = 10,
  contentRepeat = 12,
  includeTrailingUser = true,
}) {
  const messages = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    messages.push(
      createMessage(`u${round}`, "user", `USER_ROUND_${round}`, contentRepeat),
      createMessage(
        `a${round}`,
        "assistant",
        `ASSISTANT_ROUND_${round}`,
        contentRepeat,
      ),
    );
  }
  if (includeTrailingUser) {
    messages.push(
      createMessage(
        `u${totalRounds + 1}`,
        "user",
        `USER_ROUND_${totalRounds + 1}`,
        contentRepeat,
      ),
    );
  }
  return messages;
}

function createMockRes() {
  const chunks = [];
  return {
    statusCode: 200,
    headersSent: false,
    ended: false,
    jsonPayload: null,
    headerMap: new Map(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      this.ended = true;
      this.headersSent = true;
      return this;
    },
    setHeader(name, value) {
      this.headerMap.set(String(name).toLowerCase(), value);
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(chunk) {
      this.headersSent = true;
      chunks.push(String(chunk));
      return true;
    },
    end(chunk = "") {
      if (chunk) this.write(chunk);
      this.ended = true;
    },
    get bodyText() {
      return chunks.join("");
    },
  };
}

function parseSseEvents(rawText) {
  return String(rawText || "")
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLines = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      let data = null;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch {
        data = dataLines.join("\n");
      }
      return {
        event: eventLine ? eventLine.slice(6).trim() : "message",
        data,
      };
    });
}

function buildOpenAiLikeStreamResponse(text = "测试回答", usage = {}) {
  const blocks = [
    `data: ${JSON.stringify({
      choices: [{ delta: { content: text } }],
      usage: {
        prompt_tokens: usage.prompt_tokens ?? 120,
        completion_tokens: usage.completion_tokens ?? 24,
        total_tokens: usage.total_tokens ?? 144,
      },
    })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const stream = new ReadableStream({
    start(controller) {
      blocks.forEach((item) =>
        controller.enqueue(new TextEncoder().encode(item)),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function buildJsonChatCompletionResponse(contentObject) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify(contentObject),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function withMockedFetch(handler) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const body = JSON.parse(String(init?.body || "{}"));
    calls.push({
      url: typeof input === "string" ? input : input?.url || "",
      body,
      init,
    });

    if (body.stream === false && body.response_format?.type === "json_object") {
      return buildJsonChatCompletionResponse({
        goal: "压缩后的目标",
        facts: ["历史已压缩为 session notes"],
        pending: ["继续回答当前问题"],
      });
    }

    return buildOpenAiLikeStreamResponse("集成测试回答", {
      prompt_tokens: 321,
      completion_tokens: 45,
      total_tokens: 366,
    });
  };

  return Promise.resolve()
    .then(() => handler(calls))
    .finally(() => {
      globalThis.fetch = originalFetch;
    });
}

async function connectMongoOnce() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 6000 });
}

async function cleanupSessionArtifacts(sessionId) {
  await mongoose.connection
    .collection("session_notes")
    .deleteMany({ userId: TEST_STORAGE_USER_ID, sessionId });
  await mongoose.connection
    .collection("uploaded_file_contexts")
    .deleteMany({ userId: TEST_STORAGE_USER_ID, sessionId })
    .catch(() => {});
}

async function seedSessionNotes({
  sessionId,
  notes,
  summaryUpToMessageId = "",
  tokenEstimate = 300,
}) {
  const now = new Date();
  await mongoose.connection.collection("session_notes").insertOne({
    userId: TEST_STORAGE_USER_ID,
    sessionId,
    tokenEstimate,
    notes,
    recentTurns: [],
    summaryUpToMessageId,
    compressionLockUntil: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function readSessionNotesDoc(sessionId) {
  return (
    (await mongoose.connection.collection("session_notes").findOne({
      userId: TEST_STORAGE_USER_ID,
      sessionId,
    })) || null
  );
}

function buildRuntimeConfig(maxOutputTokens = 256000) {
  return {
    provider: "packycode",
    protocol: "chat",
    model: "gpt-5.4",
    maxOutputTokens,
    enableThinking: false,
    temperature: 0.6,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    contextRounds: 12,
  };
}

async function runCase(name, runner) {
  try {
    await runner();
    console.log(`✅ ${name}`);
    return { name, ok: true, detail: "passed" };
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error?.stack || error?.message || error}`);
    return { name, ok: false, detail: error?.message || String(error) };
  }
}

const results = [];

await connectMongoOnce();

results.push(
  await runCase("触发压缩时先发 context_compacting，再用 notes + recentTurns 请求上游", async () => {
    const sessionId = `it-${crypto.randomUUID()}`;
    await cleanupSessionArtifacts(sessionId);
    const messages = createConversation({ totalRounds: 10, contentRepeat: 20000 });
    const expectedRecent = pickRecentUserRounds(messages, 8);

    await withMockedFetch(async (calls) => {
      const res = createMockRes();
      await streamAgentResponse({
        res,
        agentId: "A",
        messages,
        runtimeConfig: buildRuntimeConfig(256000),
        providerOverride: "packycode",
        modelOverride: "gpt-5.4",
        systemPromptOverride: "系统提示词",
        chatUserId: TEST_CHAT_USER_ID,
        chatStorageUserId: TEST_STORAGE_USER_ID,
        teacherScopeKey: DEFAULT_TEACHER_SCOPE_KEY,
        sessionId,
        attachUploadedFiles: false,
      });

      const events = parseSseEvents(res.bodyText);
      const compactingEvents = events.filter(
        (item) => item.event === "context_compacting",
      );
      const metaEvent = events.find((item) => item.event === "meta");
      const tokenEvent = events.find((item) => item.event === "token");
      const usageEvent = events.find((item) => item.event === "usage");

      assert.equal(compactingEvents.length, 2, "应发送 start/done 两个压缩状态事件");
      assert.equal(compactingEvents[0].data.phase, "start");
      assert.equal(compactingEvents[1].data.phase, "done");
      assert.ok(metaEvent?.data?.contextCompression?.applied, "meta 应标记已压缩");
      assert.equal(tokenEvent?.data?.text, "集成测试回答");
      assert.equal(usageEvent?.data?.usage?.total_tokens, 366);

      assert.equal(calls.length, 2, "应先调用 notes summarizer，再调用上游 chat");
      const summarizerCall = calls[0].body;
      const upstreamCall = calls[1].body;

      assert.equal(summarizerCall.stream, false);
      assert.equal(upstreamCall.stream, true);
      assert.ok(
        upstreamCall.max_tokens < 256000,
        `max_tokens 应被安全收缩，实际为 ${upstreamCall.max_tokens}`,
      );
      assert.equal(
        upstreamCall.messages.length,
        expectedRecent.length + 1,
        "上游应只收到 system + recentTurns",
      );
      assert.ok(
        String(upstreamCall.messages[0]?.content || "").includes("结构化笔记"),
        "system prompt 应包含 session notes",
      );
      assert.ok(
        !upstreamCall.messages.some((item) =>
          String(item?.content || "").includes("USER_ROUND_1 "),
        ),
        "压缩后上游不应再收到完整历史开头",
      );

      const notesDoc = await readSessionNotesDoc(sessionId);
      assert.ok(notesDoc, "压缩后应写入 session_notes 文档");
      assert.ok(notesDoc.summaryUpToMessageId, "应记录 summaryUpToMessageId");
      assert.equal(notesDoc.notes.goal, "压缩后的目标");
    });
  }),
);

results.push(
  await runCase("已有 summaryUpToMessageId 且 older history 已覆盖时，会直接裁成 recentTurns", async () => {
    const sessionId = `it-${crypto.randomUUID()}`;
    await cleanupSessionArtifacts(sessionId);
    const messages = createConversation({ totalRounds: 10, contentRepeat: 24 });
    const expectedRecent = pickRecentUserRounds(messages, 8);
    const older = messages.slice(0, messages.length - expectedRecent.length);
    const coveredUpTo = older[older.length - 1]?.id || "";
    await seedSessionNotes({
      sessionId,
      summaryUpToMessageId: coveredUpTo,
      notes: {
        goal: "已有长期目标",
        facts: ["历史已被压缩存档"],
        fileSummaries: [],
      },
    });

    await withMockedFetch(async (calls) => {
      const res = createMockRes();
      await streamAgentResponse({
        res,
        agentId: "A",
        messages,
        runtimeConfig: buildRuntimeConfig(4096),
        providerOverride: "packycode",
        modelOverride: "gpt-5.4",
        systemPromptOverride: "系统提示词",
        chatUserId: TEST_CHAT_USER_ID,
        chatStorageUserId: TEST_STORAGE_USER_ID,
        teacherScopeKey: DEFAULT_TEACHER_SCOPE_KEY,
        sessionId,
        attachUploadedFiles: false,
      });

      const events = parseSseEvents(res.bodyText);
      const compactingEvents = events.filter(
        (item) => item.event === "context_compacting",
      );
      const metaEvent = events.find((item) => item.event === "meta");
      assert.equal(compactingEvents.length, 0, "不应再次触发压缩");
      assert.equal(calls.length, 1, "应只调用一次上游 chat");

      const upstreamCall = calls[0].body;
      assert.equal(upstreamCall.messages.length, expectedRecent.length + 1);
      assert.ok(
        String(upstreamCall.messages[0]?.content || "").includes("已有长期目标"),
        "system prompt 应注入已有 notes",
      );
      assert.equal(
        metaEvent?.data?.contextCompression?.applied || false,
        false,
      );
    });
  }),
);

results.push(
  await runCase("只有 notes 但没有 summaryUpToMessageId 时，不会误把 full history 裁掉", async () => {
    const sessionId = `it-${crypto.randomUUID()}`;
    await cleanupSessionArtifacts(sessionId);
    const messages = createConversation({ totalRounds: 10, contentRepeat: 20 });
    await seedSessionNotes({
      sessionId,
      summaryUpToMessageId: "",
      notes: {
        goal: "只整理过文件摘要",
        facts: [],
        fileSummaries: [
          {
            filename: "brief.md",
            summary: "只写入过文件摘要，还没有压缩对话历史。",
            keyPoints: ["不要提前裁掉旧消息"],
          },
        ],
      },
    });

    await withMockedFetch(async (calls) => {
      const res = createMockRes();
      await streamAgentResponse({
        res,
        agentId: "A",
        messages,
        runtimeConfig: buildRuntimeConfig(4096),
        providerOverride: "packycode",
        modelOverride: "gpt-5.4",
        systemPromptOverride: "系统提示词",
        chatUserId: TEST_CHAT_USER_ID,
        chatStorageUserId: TEST_STORAGE_USER_ID,
        teacherScopeKey: DEFAULT_TEACHER_SCOPE_KEY,
        sessionId,
        attachUploadedFiles: false,
      });

      const events = parseSseEvents(res.bodyText);
      const compactingEvents = events.filter(
        (item) => item.event === "context_compacting",
      );
      assert.equal(compactingEvents.length, 0, "预算充足时不应触发压缩");
      assert.equal(calls.length, 1);

      const upstreamCall = calls[0].body;
      assert.equal(
        upstreamCall.messages.length,
        messages.length + 1,
        "没有 summaryUpToMessageId 时，应保留 full history + system",
      );
      assert.ok(
        String(upstreamCall.messages[0]?.content || "").includes("只整理过文件摘要"),
        "system prompt 仍应带上 notes",
      );
      assert.ok(
        String(upstreamCall.messages[1]?.content || "").includes("USER_ROUND_1"),
        "full history 的第一条用户消息应仍然存在",
      );
    });
  }),
);

console.log("\n=== Summary ===");
results.forEach((item, index) => {
  console.log(`${index + 1}. ${item.ok ? "PASS" : "FAIL"} | ${item.name}`);
});

const failed = results.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n结论：${failed.length} 项 route-level 集成测试失败。`);
  process.exitCode = 1;
} else {
  console.log("\n结论：route-level session-notes 集成测试全部通过。");
}

await mongoose.connection.close().catch(() => {});
