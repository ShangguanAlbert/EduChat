import assert from "node:assert/strict";

import { createAppContext } from "../server/app/createAppContext.js";

function createMessage(id, role, content) {
  return {
    id,
    role,
    content,
    firstTextAt: new Date().toISOString(),
  };
}

async function main() {
  const deps = createAppContext();

  const source = {
    activeId: "s1",
    groups: [{ id: "g1", name: "旧分组", description: "" }],
    sessions: [
      { id: "s1", title: "旧会话", groupId: "g1", pinned: false },
      { id: "s1775532240895-fvwep9", title: "新会话", groupId: null, pinned: true },
    ],
    sessionMessages: {
      s1: [createMessage("m1", "user", "旧消息")],
      "s1775532240895-fvwep9": [createMessage("m2", "assistant", "新消息")],
    },
    sessionContextRefs: {
      s1: {
        previousResponseId: "resp_123",
        provider: "volcengine",
        protocol: "responses",
        model: "doubao-seed-2-0-pro-250415",
        agentId: "A",
        updatedAt: new Date().toISOString(),
      },
    },
    settings: {
      agent: "A",
      agentBySession: {
        s1: "A",
        "s1775532240895-fvwep9": "B",
      },
      apiTemperature: 0.6,
      apiTopP: 1,
      apiReasoningEffort: "high",
      lastAppliedReasoning: "high",
      smartContextEnabled: false,
      smartContextEnabledBySessionAgent: {
        "s1::A": true,
        "s1775532240895-fvwep9::B": false,
      },
    },
  };

  const migrated = deps.migrateLegacyChatStateSessionIds(source, {
    nowMs: 1775533600000,
  });

  assert.equal(migrated.changed, true, "应识别 legacy sessionId 并触发迁移");
  assert.equal(
    typeof migrated.sessionIdMap.s1,
    "string",
    "旧 sessionId 应映射到新的字符串 id",
  );
  assert.notEqual(migrated.sessionIdMap.s1, "s1", "新的 sessionId 不应继续为 s1");
  assert.equal(
    migrated.state.activeId,
    migrated.sessionIdMap.s1,
    "activeId 应同步切换到新 sessionId",
  );
  assert.equal(
    migrated.state.sessions.some((session) => session.id === migrated.sessionIdMap.s1),
    true,
    "sessions 列表应写入新 sessionId",
  );
  assert.deepEqual(
    migrated.state.sessionMessages[migrated.sessionIdMap.s1].map((message) => message.id),
    ["m1"],
    "sessionMessages 应迁移到新 key",
  );
  assert.equal(
    migrated.state.settings.agentBySession[migrated.sessionIdMap.s1],
    "A",
    "agentBySession 应迁移到新 key",
  );
  assert.equal(
    migrated.state.settings.smartContextEnabledBySessionAgent[
      `${migrated.sessionIdMap.s1}::A`
    ],
    true,
    "smartContextEnabledBySessionAgent 应迁移到新 key",
  );
  assert.equal(
    migrated.state.sessionContextRefs[migrated.sessionIdMap.s1]?.previousResponseId,
    "resp_123",
    "sessionContextRefs 应迁移到新 key",
  );
  assert.equal(
    migrated.state.sessions.some((session) => session.id === "s1"),
    false,
    "迁移后 sessions 不应残留 s1",
  );

  const untouched = deps.migrateLegacyChatStateSessionIds({
    activeId: "s1775532240895-fvwep9",
    groups: [],
    sessions: [
      {
        id: "s1775532240895-fvwep9",
        title: "已是新格式",
        groupId: null,
        pinned: false,
      },
    ],
    sessionMessages: {
      "s1775532240895-fvwep9": [createMessage("m3", "assistant", "ok")],
    },
    settings: {},
  });
  assert.equal(untouched.changed, false, "新格式 sessionId 不应被重复迁移");

  console.log(
    `[chat-session-id-migration] ok newSessionId=${migrated.sessionIdMap.s1}`,
  );
}

main().catch((error) => {
  console.error("[chat-session-id-migration] failed:", error);
  process.exitCode = 1;
});
