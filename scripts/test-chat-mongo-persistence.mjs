import assert from "node:assert/strict";

import { createAppContext } from "../server/app/createAppContext.js";

function createMessage(id, role, content, extra = {}) {
  return {
    id,
    role,
    content,
    createdAt: extra.createdAt || new Date().toISOString(),
    ...extra,
  };
}

async function main() {
  const deps = createAppContext();
  const teacherScopeKey = deps.DEFAULT_TEACHER_SCOPE_KEY;
  const userId = new deps.mongoose.Types.ObjectId();
  const sessionId = `s-persist-${Date.now()}`;
  const groupId = `g-persist-${Date.now()}`;
  const renamedGroupName = "验证分组（已重命名）";
  const renamedTitle = "持久化验证（已重命名）";
  const statePath = deps.getTeacherScopedChatStatePath("sessionMessages", teacherScopeKey);
  const sessionMessagesPath = deps.getTeacherScopedChatStatePath(
    `sessionMessages.${sessionId}`,
    teacherScopeKey,
  );

  await deps.mongoose.connect(deps.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[chat-persist] Mongo connected: ${deps.mongoUri}`);

  try {
    await deps.ChatState.deleteOne({ userId });

    const initialPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: [],
      sessions: [{ id: sessionId, title: "持久化验证", groupId: null, pinned: false }],
      sessionMessages: {
        [sessionId]: [createMessage("m1", "user", "第一条消息")],
      },
      settings: {},
    });

    const currentState = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    const initialMerge = deps.mergeChatStateSessionMessagesPreservingCompleteness(
      currentState.sessionMessages,
      initialPayload.sessionMessages,
      initialPayload.sessions,
    );
    const initialSetPayload = { userId };
    initialSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      initialPayload.activeId;
    initialSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      initialPayload.groups;
    initialSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      initialPayload.sessions;
    initialSetPayload[statePath] = initialMerge.sessionMessages;
    initialSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      initialPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: initialSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterStateSave = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );

    assert.equal(
      persistedAfterStateSave.sessions.some((session) => session.id === sessionId),
      true,
      "session 应在 /api/chat/state 写入后存在",
    );
    assert.deepEqual(
      persistedAfterStateSave.sessionMessages[sessionId]?.map((message) => message.id),
      ["m1"],
      "首条消息应在 /api/chat/state 写入后持久化",
    );

    const sourceMessages = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    ).sessionMessages;
    const currentList = Array.isArray(sourceMessages[sessionId])
      ? sourceMessages[sessionId].slice(0, 400)
      : [];
    currentList.push(createMessage("m2", "assistant", "第二条消息"));

    await deps.ChatState.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          [sessionMessagesPath]: currentList,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterMessageUpsert = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    const persistedMessages = Array.isArray(
      persistedAfterMessageUpsert.sessionMessages[sessionId],
    )
      ? persistedAfterMessageUpsert.sessionMessages[sessionId]
      : [];

    assert.deepEqual(
      persistedMessages.map((message) => message.id),
      ["m1", "m2"],
      "消息 upsert 后应能从 Mongo 读回完整历史",
    );

    const metadataOnlyPayload = deps.sanitizeChatStateMetaPayload({
      activeId: sessionId,
      groups: [],
      sessions: [{ id: sessionId, title: "仅元数据更新", groupId: null, pinned: false }],
      settings: {
        agent: "A",
      },
    });
    const metadataOnlySetPayload = { userId };
    metadataOnlySetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      metadataOnlyPayload.activeId;
    metadataOnlySetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      metadataOnlyPayload.groups;
    metadataOnlySetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      metadataOnlyPayload.sessions;
    metadataOnlySetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      metadataOnlyPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: metadataOnlySetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterMetadataOnlySave = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterMetadataOnlySave.sessions.find((session) => session.id === sessionId)?.title,
      "仅元数据更新",
      "session 元数据更新后应能从 Mongo 读到新标题",
    );
    assert.deepEqual(
      (persistedAfterMetadataOnlySave.sessionMessages[sessionId] || []).map(
        (message) => message.id,
      ),
      ["m1", "m2"],
      "session 元数据更新后不应清空已有消息历史",
    );

    const renamedPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: [],
      sessions: [{ id: sessionId, title: renamedTitle, groupId: null, pinned: false }],
      sessionMessages: {
        [sessionId]: persistedMessages,
      },
      settings: {},
    });

    const renamedSetPayload = { userId };
    renamedSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      renamedPayload.activeId;
    renamedSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      renamedPayload.groups;
    renamedSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      renamedPayload.sessions;
    renamedSetPayload[statePath] = renamedPayload.sessionMessages;
    renamedSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      renamedPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: renamedSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterRename = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterRename.sessions.find((session) => session.id === sessionId)?.title,
      renamedTitle,
      "session 重命名后应能立刻从 Mongo 读到新标题",
    );

    const createdGroupPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: [{ id: groupId, name: "验证分组", description: "move session" }],
      sessions: [{ id: sessionId, title: renamedTitle, groupId: null, pinned: false }],
      sessionMessages: {
        [sessionId]: persistedMessages,
      },
      settings: {},
    });
    const createdGroupSetPayload = { userId };
    createdGroupSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      createdGroupPayload.activeId;
    createdGroupSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      createdGroupPayload.groups;
    createdGroupSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      createdGroupPayload.sessions;
    createdGroupSetPayload[statePath] = createdGroupPayload.sessionMessages;
    createdGroupSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      createdGroupPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: createdGroupSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterGroupCreate = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterGroupCreate.groups.find((group) => group.id === groupId)?.name,
      "验证分组",
      "group 创建后应立刻从 Mongo 读到新分组",
    );

    const renamedGroupPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: [
        {
          id: groupId,
          name: renamedGroupName,
          description: "move session renamed",
        },
      ],
      sessions: [{ id: sessionId, title: renamedTitle, groupId: null, pinned: false }],
      sessionMessages: {
        [sessionId]: persistedMessages,
      },
      settings: {},
    });
    const renamedGroupSetPayload = { userId };
    renamedGroupSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      renamedGroupPayload.activeId;
    renamedGroupSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      renamedGroupPayload.groups;
    renamedGroupSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      renamedGroupPayload.sessions;
    renamedGroupSetPayload[statePath] = renamedGroupPayload.sessionMessages;
    renamedGroupSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      renamedGroupPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: renamedGroupSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterGroupRename = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterGroupRename.groups.find((group) => group.id === groupId)?.name,
      renamedGroupName,
      "group 重命名后应立刻从 Mongo 读到新名称",
    );

    const movedPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: persistedAfterGroupRename.groups,
      sessions: [{ id: sessionId, title: renamedTitle, groupId, pinned: false }],
      sessionMessages: {
        [sessionId]: persistedMessages,
      },
      settings: {},
    });
    const movedSetPayload = { userId };
    movedSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      movedPayload.activeId;
    movedSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      movedPayload.groups;
    movedSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      movedPayload.sessions;
    movedSetPayload[statePath] = movedPayload.sessionMessages;
    movedSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      movedPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: movedSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterMove = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterMove.sessions.find((session) => session.id === sessionId)?.groupId,
      groupId,
      "session 移动分组后应立刻从 Mongo 读到 groupId",
    );

    const pinnedPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: persistedAfterMove.groups,
      sessions: [{ id: sessionId, title: renamedTitle, groupId, pinned: true }],
      sessionMessages: {
        [sessionId]: persistedMessages,
      },
      settings: {},
    });
    const pinnedSetPayload = { userId };
    pinnedSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      pinnedPayload.activeId;
    pinnedSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      pinnedPayload.groups;
    pinnedSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      pinnedPayload.sessions;
    pinnedSetPayload[statePath] = pinnedPayload.sessionMessages;
    pinnedSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      pinnedPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: pinnedSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterPin = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterPin.sessions.find((session) => session.id === sessionId)?.pinned,
      true,
      "session 置顶后应立刻从 Mongo 读到 pinned=true",
    );

    const deletedGroupPayload = deps.sanitizeChatStatePayload({
      activeId: sessionId,
      groups: [],
      sessions: [{ id: sessionId, title: renamedTitle, groupId: null, pinned: true }],
      sessionMessages: {
        [sessionId]: persistedMessages,
      },
      settings: {},
    });
    const deletedGroupSetPayload = { userId };
    deletedGroupSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      deletedGroupPayload.activeId;
    deletedGroupSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      deletedGroupPayload.groups;
    deletedGroupSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      deletedGroupPayload.sessions;
    deletedGroupSetPayload[statePath] = deletedGroupPayload.sessionMessages;
    deletedGroupSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      deletedGroupPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: deletedGroupSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterGroupDelete = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterGroupDelete.groups.some((group) => group.id === groupId),
      false,
      "group 删除后应立刻从 Mongo 消失",
    );
    assert.equal(
      persistedAfterGroupDelete.sessions.find((session) => session.id === sessionId)?.groupId,
      null,
      "group 删除后关联 session 应立刻解除分组",
    );

    const deletedPayload = deps.sanitizeChatStatePayload({
      activeId: "s1",
      groups: persistedAfterGroupDelete.groups,
      sessions: [],
      sessionMessages: {},
      settings: {},
    });
    const deletedMerge = deps.mergeChatStateSessionMessagesPreservingCompleteness(
      persistedAfterGroupDelete.sessionMessages,
      deletedPayload.sessionMessages,
      deletedPayload.sessions,
    );
    const deletedSetPayload = { userId };
    deletedSetPayload[deps.getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      deletedPayload.activeId;
    deletedSetPayload[deps.getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      deletedPayload.groups;
    deletedSetPayload[deps.getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      deletedPayload.sessions;
    deletedSetPayload[statePath] = deletedMerge.sessionMessages;
    deletedSetPayload[deps.getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      deletedPayload.settings;

    await deps.ChatState.findOneAndUpdate(
      { userId },
      { $set: deletedSetPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const persistedAfterDelete = deps.normalizeChatStateDoc(
      await deps.ChatState.findOne({ userId }).lean(),
      teacherScopeKey,
    );
    assert.equal(
      persistedAfterDelete.sessions.some((session) => session.id === sessionId),
      false,
      "session 删除后应立刻从 Mongo 消失",
    );

    console.log(
      `[chat-persist] ok session=${sessionId} messages=${persistedMessages.length} group-create-rename session-rename-move-pin group-delete session-delete=passed`,
    );
  } finally {
    await deps.ChatState.deleteOne({ userId }).catch(() => {});
    await deps.mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[chat-persist] failed:", error);
  process.exitCode = 1;
});
