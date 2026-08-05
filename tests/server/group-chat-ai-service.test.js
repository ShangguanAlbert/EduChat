import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUP_CHAT_AI_LIMITS,
  GROUP_CHAT_AI_RUNTIME,
  buildGroupChatAiFailedReplyDraft,
  buildGroupChatAiPendingReplyDraft,
  buildGroupChatAiContextSnapshot,
  checkGroupChatAiEnqueuePolicy,
  checkGroupChatAiStartPolicy,
  isGroupChatAiMentionRequested,
  stripGroupChatAiMentions,
} from "../../server/services/group-chat-ai.js";

test("GROUP_CHAT_AI_RUNTIME defaults to the Aliyun group-chat route", () => {
  assert.deepEqual(GROUP_CHAT_AI_RUNTIME, {
    agentId: "A",
    provider: "aliyun",
    model: "qwen3.7-plus",
    protocol: "dashscope",
  });
});

test("GROUP_CHAT_AI_LIMITS reflects the agreed room and user quotas", () => {
  assert.deepEqual(GROUP_CHAT_AI_LIMITS, {
    roomRunning: 4,
    userRunning: 2,
    userPending: 3,
    roomPending: 12,
    duplicateWindowMs: 10_000,
    taskTimeoutMs: 75_000,
  });
});

test("isGroupChatAiMentionRequested detects @AI case-insensitively", () => {
  assert.equal(isGroupChatAiMentionRequested("大家先讨论一下"), false);
  assert.equal(isGroupChatAiMentionRequested("@AI 帮我总结一下"), true);
  assert.equal(isGroupChatAiMentionRequested("请 @ai 看看上面的文件"), true);
  assert.equal(isGroupChatAiMentionRequested("@AIX 这个不算"), false);
});

test("stripGroupChatAiMentions removes only the AI mention token", () => {
  assert.equal(stripGroupChatAiMentions("@AI 帮我总结一下"), "帮我总结一下");
  assert.equal(stripGroupChatAiMentions("请 @ai 看看上面的文件"), "请 看看上面的文件");
  assert.equal(stripGroupChatAiMentions("@AIX 保留"), "@AIX 保留");
});

test("checkGroupChatAiEnqueuePolicy rejects duplicate and queue overflow cases", () => {
  assert.deepEqual(
    checkGroupChatAiEnqueuePolicy({
      duplicateActive: true,
      roomPendingCount: 0,
      userPendingCount: 0,
    }),
    {
      accepted: false,
      code: "duplicate_active",
      message: "相同问题已在处理中。",
    },
  );

  assert.deepEqual(
    checkGroupChatAiEnqueuePolicy({
      duplicateActive: false,
      roomPendingCount: 12,
      userPendingCount: 0,
    }),
    {
      accepted: false,
      code: "room_pending_limit",
      message: "当前群聊等待中的 AI 请求过多，请稍后再试。",
    },
  );

  assert.deepEqual(
    checkGroupChatAiEnqueuePolicy({
      duplicateActive: false,
      roomPendingCount: 0,
      userPendingCount: 3,
    }),
    {
      accepted: false,
      code: "user_pending_limit",
      message: "你当前等待中的 AI 请求过多，请稍后再试。",
    },
  );
});

test("checkGroupChatAiEnqueuePolicy accepts requests under the pending limits", () => {
  assert.deepEqual(
    checkGroupChatAiEnqueuePolicy({
      duplicateActive: false,
      roomPendingCount: 11,
      userPendingCount: 2,
    }),
    {
      accepted: true,
      code: "accepted",
      message: "",
    },
  );
});

test("checkGroupChatAiStartPolicy enforces room and user running limits", () => {
  assert.deepEqual(
    checkGroupChatAiStartPolicy({
      roomRunningCount: 4,
      userRunningCount: 0,
    }),
    {
      accepted: false,
      code: "room_running_limit",
      message: "当前群聊正在运行的 AI 请求过多，请稍后再试。",
    },
  );

  assert.deepEqual(
    checkGroupChatAiStartPolicy({
      roomRunningCount: 1,
      userRunningCount: 2,
    }),
    {
      accepted: false,
      code: "user_running_limit",
      message: "你当前正在运行的 AI 请求过多，请稍后再试。",
    },
  );

  assert.deepEqual(
    checkGroupChatAiStartPolicy({
      roomRunningCount: 3,
      userRunningCount: 1,
    }),
    {
      accepted: true,
      code: "accepted",
      message: "",
    },
  );
});

test("buildGroupChatAiContextSnapshot prioritizes the replied attachment and recent transcript", () => {
  const snapshot = buildGroupChatAiContextSnapshot({
    room: {
      id: "room-1",
      name: "教育技术讨论群",
    },
    triggerMessage: {
      id: "msg-4",
      roomId: "room-1",
      senderUserId: "user-1",
      senderName: "张三",
      type: "text",
      content: "@AI 请结合上面的表格给我结论",
      replyToMessageId: "msg-2",
      createdAt: "2026-05-09T10:00:04.000Z",
    },
    recentMessages: [
      {
        id: "msg-1",
        roomId: "room-1",
        senderUserId: "user-2",
        senderName: "李四",
        type: "text",
        content: "这是课堂讨论的背景。",
        createdAt: "2026-05-09T10:00:01.000Z",
      },
      {
        id: "msg-2",
        roomId: "room-1",
        senderUserId: "user-2",
        senderName: "李四",
        type: "file",
        content: "",
        file: {
          fileId: "file-2",
          fileName: "课程数据.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: 1024,
        },
        createdAt: "2026-05-09T10:00:02.000Z",
      },
      {
        id: "msg-3",
        roomId: "room-1",
        senderUserId: "user-3",
        senderName: "王五",
        type: "text",
        content: "我觉得第三列和成绩更相关。",
        createdAt: "2026-05-09T10:00:03.000Z",
      },
      {
        id: "msg-4",
        roomId: "room-1",
        senderUserId: "user-1",
        senderName: "张三",
        type: "text",
        content: "@AI 请结合上面的表格给我结论",
        replyToMessageId: "msg-2",
        createdAt: "2026-05-09T10:00:04.000Z",
      },
    ],
  });

  assert.equal(snapshot.roomId, "room-1");
  assert.equal(snapshot.roomName, "教育技术讨论群");
  assert.equal(snapshot.triggerMessageId, "msg-4");
  assert.equal(snapshot.requestedByUserId, "user-1");
  assert.equal(snapshot.requestedByUserName, "张三");
  assert.equal(snapshot.userQuestion, "请结合上面的表格给我结论");
  assert.equal(snapshot.replyTargetMessageId, "msg-2");
  assert.equal(snapshot.attachmentMessages.length, 1);
  assert.equal(snapshot.attachmentMessages[0].id, "msg-2");
  assert.match(snapshot.transcriptText, /李四：这是课堂讨论的背景。/);
  assert.match(snapshot.transcriptText, /王五：我觉得第三列和成绩更相关。/);
});

test("buildGroupChatAiContextSnapshot includes the task and parsed task attachments", () => {
  const snapshot = buildGroupChatAiContextSnapshot({
    room: {
      _id: "room-2",
      name: "网页设计协作派",
      announcement: "完成校园活动介绍页，并解释布局选择。",
      announcementAttachments: [
        {
          fileName: "任务说明.pdf",
          mimeType: "application/pdf",
          aiContextText: "学生需要先规划页面结构，再设计卡片布局。",
          aiContextHint: "PDF 文本解析结果。",
        },
      ],
    },
    triggerMessage: {
      id: "msg-task",
      senderUserId: "student-1",
      senderName: "小林",
      content: "@AI 我们下一步该检查什么？",
    },
    recentMessages: [],
  });

  assert.equal(snapshot.roomId, "room-2");
  assert.equal(snapshot.taskContext.text, "完成校园活动介绍页，并解释布局选择。");
  assert.equal(snapshot.taskContext.attachments[0].fileName, "任务说明.pdf");
  assert.match(snapshot.taskContext.attachments[0].text, /规划页面结构/);
});

test("buildGroupChatAiPendingReplyDraft creates an AI placeholder reply", () => {
  const pendingReply = buildGroupChatAiPendingReplyDraft({
    roomId: "room-1",
    triggerMessageId: "msg-9",
    requestedByUserId: "user-7",
  });

  assert.equal(pendingReply.roomId, "room-1");
  assert.equal(pendingReply.type, "text");
  assert.equal(pendingReply.senderKind, "ai");
  assert.equal(pendingReply.replyToMessageId, "msg-9");
  assert.equal(pendingReply.aiMeta.requestedByUserId, "user-7");
  assert.equal(pendingReply.aiMeta.status, "pending");
  assert.equal(pendingReply.aiMeta.model, "qwen3.7-plus");
  assert.equal(pendingReply.aiMeta.streaming, false);
  assert.equal(pendingReply.senderName, "琳琳 · PAIA");
  assert.match(pendingReply.content, /整理思路/);
});

test("buildGroupChatAiFailedReplyDraft creates a failed AI reply bound to the trigger message", () => {
  const failedReply = buildGroupChatAiFailedReplyDraft({
    roomId: "room-1",
    triggerMessageId: "msg-10",
    requestedByUserId: "user-9",
    errorMessage: "当前群聊等待中的 AI 请求过多，请稍后再试。",
  });

  assert.equal(failedReply.roomId, "room-1");
  assert.equal(failedReply.senderKind, "ai");
  assert.equal(failedReply.replyToMessageId, "msg-10");
  assert.equal(failedReply.aiMeta.status, "failed");
  assert.equal(failedReply.aiMeta.error, "当前群聊等待中的 AI 请求过多，请稍后再试。");
  assert.match(failedReply.content, /请稍后再试/);
});
