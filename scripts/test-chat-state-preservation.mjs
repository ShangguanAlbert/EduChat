import assert from "node:assert/strict";

import {
  DEFAULT_TEACHER_SCOPE_KEY,
  mergeChatStateSessionMessagesPreservingCompleteness,
  normalizeChatStateDoc,
  sanitizeChatStatePayload,
} from "../server/services/core-runtime.js";

function createMessage(id, role, content, extra = {}) {
  return {
    id,
    role,
    content,
    createdAt: extra.createdAt || "2026-04-04T00:00:00.000Z",
    ...extra,
  };
}

function runRouteLikeMerge({ currentStateDoc, nextPayload }) {
  const currentState = normalizeChatStateDoc(
    currentStateDoc,
    DEFAULT_TEACHER_SCOPE_KEY,
  );
  const nextState = sanitizeChatStatePayload(nextPayload);
  return {
    nextState,
    ...mergeChatStateSessionMessagesPreservingCompleteness(
      currentState.sessionMessages,
      nextState.sessionMessages,
      nextState.sessions,
    ),
  };
}

function runCase(name, runner) {
  try {
    runner();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

runCase("保留服务端更完整的旧会话，不被只剩一条消息的快照覆盖", () => {
  const result = runRouteLikeMerge({
    currentStateDoc: {
      activeId: "s1",
      sessions: [{ id: "s1", title: "旧会话", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "第一条提问"),
          createMessage("m2", "assistant", "这是比较完整的回答，带有更多正文", {
            reasoning: "完整推理",
          }),
          createMessage("m3", "user", "继续追问"),
        ],
      },
    },
    nextPayload: {
      activeId: "s1",
      groups: [],
      sessions: [{ id: "s1", title: "旧会话", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [createMessage("m3", "user", "继续追问")],
      },
      settings: {},
    },
  });

  assert.deepEqual(
    result.sessionMessages.s1.map((item) => item.id),
    ["m1", "m2", "m3"],
  );
  assert.deepEqual(result.preservedSessionIds, ["s1"]);
});

runCase("接受前端新增的完整新消息，不误伤正常增长", () => {
  const result = runRouteLikeMerge({
    currentStateDoc: {
      activeId: "s1",
      sessions: [{ id: "s1", title: "增长会话", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [createMessage("m1", "user", "你好")],
      },
    },
    nextPayload: {
      activeId: "s1",
      groups: [],
      sessions: [{ id: "s1", title: "增长会话", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "你好"),
          createMessage("m2", "assistant", "这里是新返回的完整回答"),
        ],
      },
      settings: {},
    },
  });

  assert.deepEqual(
    result.sessionMessages.s1.map((item) => item.id),
    ["m1", "m2"],
  );
  assert.deepEqual(result.preservedSessionIds, []);
});

runCase("同一消息 id 出现残缺版本时，保留更完整正文并合并后续消息", () => {
  const result = runRouteLikeMerge({
    currentStateDoc: {
      activeId: "s1",
      sessions: [{ id: "s1", title: "流式会话", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "帮我总结"),
          createMessage("m2", "assistant", "这是完整回答，正文更长", {
            attachments: [{ name: "proof.png" }],
          }),
        ],
      },
    },
    nextPayload: {
      activeId: "s1",
      groups: [],
      sessions: [{ id: "s1", title: "流式会话", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "帮我总结"),
          createMessage("m2", "assistant", "短回答"),
          createMessage("m3", "user", "再细一点"),
        ],
      },
      settings: {},
    },
  });

  assert.equal(result.sessionMessages.s1[1].content, "这是完整回答，正文更长");
  assert.deepEqual(
    result.sessionMessages.s1.map((item) => item.id),
    ["m1", "m2", "m3"],
  );
  assert.deepEqual(result.preservedSessionIds, ["s1"]);
});

runCase("多会话一起保存时，只保护被截断的那个会话", () => {
  const result = runRouteLikeMerge({
    currentStateDoc: {
      activeId: "s2",
      sessions: [
        { id: "s1", title: "旧会话", groupId: null, pinned: false },
        { id: "s2", title: "新会话", groupId: null, pinned: false },
      ],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "老问题"),
          createMessage("m2", "assistant", "老回答完整版"),
        ],
        s2: [createMessage("m3", "user", "新问题")],
      },
    },
    nextPayload: {
      activeId: "s2",
      groups: [],
      sessions: [
        { id: "s1", title: "旧会话", groupId: null, pinned: false },
        { id: "s2", title: "新会话", groupId: null, pinned: false },
      ],
      sessionMessages: {
        s1: [createMessage("m2", "assistant", "老回答")],
        s2: [
          createMessage("m3", "user", "新问题"),
          createMessage("m4", "assistant", "新回答"),
        ],
      },
      settings: {},
    },
  });

  assert.deepEqual(
    result.sessionMessages.s1.map((item) => item.id),
    ["m1", "m2"],
  );
  assert.deepEqual(
    result.sessionMessages.s2.map((item) => item.id),
    ["m3", "m4"],
  );
  assert.deepEqual(result.preservedSessionIds, ["s1"]);
});

runCase("前端传空消息列表时，服务端仍保留已有历史", () => {
  const result = runRouteLikeMerge({
    currentStateDoc: {
      activeId: "s1",
      sessions: [{ id: "s1", title: "空列表保护", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "之前的消息"),
          createMessage("m2", "assistant", "之前的回答"),
        ],
      },
    },
    nextPayload: {
      activeId: "s1",
      groups: [],
      sessions: [{ id: "s1", title: "空列表保护", groupId: null, pinned: false }],
      sessionMessages: {
        s1: [],
      },
      settings: {},
    },
  });

  assert.deepEqual(
    result.sessionMessages.s1.map((item) => item.id),
    ["m1", "m2"],
  );
  assert.deepEqual(result.preservedSessionIds, ["s1"]);
});

runCase("前端只更新 session 元数据时，服务端仍保留已有历史", () => {
  const result = runRouteLikeMerge({
    currentStateDoc: {
      activeId: "s1",
      groups: [{ id: "g1", name: "旧分组", description: "" }],
      sessions: [{ id: "s1", title: "旧标题", groupId: "g1", pinned: false }],
      sessionMessages: {
        s1: [
          createMessage("m1", "user", "旧消息 1"),
          createMessage("m2", "assistant", "旧消息 2"),
        ],
      },
      settings: {},
    },
    nextPayload: {
      activeId: "s1",
      groups: [{ id: "g1", name: "新分组", description: "" }],
      sessions: [{ id: "s1", title: "新标题", groupId: "g1", pinned: true }],
      settings: {},
    },
  });

  assert.deepEqual(
    result.sessionMessages.s1.map((item) => item.id),
    ["m1", "m2"],
  );
  assert.deepEqual(result.preservedSessionIds, ["s1"]);
});

console.log("\n全部通过：聊天历史保护脚本未发现“残缺状态覆盖完整历史”的回归。");
