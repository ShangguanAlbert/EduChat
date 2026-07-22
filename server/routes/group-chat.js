import { GroupChatAiTask } from "../models/group-chat-ai-task.js";
import {
  buildGroupChatAiContextSnapshot,
  buildGroupChatAiFailedReplyDraft,
  buildGroupChatAiPendingReplyDraft,
  isGroupChatAiMentionRequested,
} from "../services/group-chat-ai.js";
import { getGroupChatAiRedisClient, getGroupChatAiRedisPrefix } from "../runtime/group-chat-ai-runtime.js";
import {
  enqueueGroupChatAiTaskId,
  reserveGroupChatAiPendingCapacity,
  rollbackGroupChatAiPendingCapacity,
} from "../runtime/group-chat-ai-redis.js";
import { clipText, parseFileContent } from "../platform/files/content-parser.js";

const GROUP_CHAT_TASK_ATTACHMENT_CONTEXT_MAX_CHARS = 8_000;

async function parseTaskAttachmentAiContext(file) {
  try {
    const parsed = await parseFileContent(file);
    return {
      aiContextText: clipText(
        parsed?.text,
        GROUP_CHAT_TASK_ATTACHMENT_CONTEXT_MAX_CHARS,
      ),
      aiContextHint: String(parsed?.hint || "").trim().slice(0, 240),
    };
  } catch (error) {
    return {
      aiContextText: "",
      aiContextHint: `附件文本解析失败：${String(error?.message || "未知错误").slice(0, 180)}`,
    };
  }
}

export function registerGroupChatRoutes(app, deps) {
  const {
    crypto,
    XLSX,
    PDFParse,
    mongoose,
    OSS,
    WebSocketServer,
    SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT,
    PROMPT_LEAK_PROBE_KEYWORDS,
    ALIYUN_SEARCH_CITATION_FORMATS,
    ALIYUN_SEARCH_FRESHNESS_OPTIONS,
    ALIYUN_SEARCH_STRATEGIES,
    DEFAULT_TEACHER_SCOPE_KEY,
    SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
    YANG_JUNFENG_TEACHER_SCOPE_KEY,
    FIXED_STUDENT_ACCOUNTS,
    FIXED_STUDENT_ACCOUNT_TAG,
    FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
    MAX_FILE_SIZE_BYTES,
    MAX_FILES,
    CHAT_PREPARED_ATTACHMENT_CACHE_TTL_MS,
    CHAT_PREPARED_ATTACHMENT_CACHE_MAX_ITEMS,
    CHAT_PREPARED_ATTACHMENT_MAX_REFS,
    MAX_IMAGE_GENERATION_INPUT_FILES,
    MAX_PARSED_CHARS_PER_FILE,
    ALIYUN_DASHSCOPE_PARSED_DOC_MAX_CHARS,
    EXCEL_PREVIEW_MAX_ROWS,
    EXCEL_PREVIEW_MAX_COLS,
    EXCEL_PREVIEW_MAX_SHEETS,
    PASSWORD_MIN_LENGTH,
    AUTH_TOKEN_TTL_SECONDS,
    ADMIN_TOKEN_TTL_SECONDS,
    USER_ONLINE_ACTIVITY_WINDOW_MS,
    USER_ONLINE_PRESENCE_RETENTION_MS,
    USER_BROWSER_HEARTBEAT_INTERVAL_MS,
    USER_BROWSER_HEARTBEAT_STALE_MS,
    AGENT_IDS,
    ADMIN_CONFIG_KEY,
    TEACHER_SCOPE_LOCKED_AGENT_MAP,
    CLASS_NAME_JIAOJI_231,
    CLASSROOM_FIRST_LESSON_DATE,
    CLASSROOM_QUESTIONNAIRE_URL,
    ADMIN_CLASSROOM_COURSE_PLAN_MAX_ITEMS,
    ADMIN_CLASSROOM_COURSE_TASK_MAX_ITEMS,
    ADMIN_CLASSROOM_COURSE_FILE_MAX_ITEMS,
    ADMIN_CLASSROOM_COURSE_FILE_UPLOAD_MAX_FILES,
    VOLCENGINE_IMAGE_GENERATION_MODEL_ID_45,
    VOLCENGINE_IMAGE_GENERATION_MODEL_ID_50,
    DEFAULT_VOLCENGINE_IMAGE_GENERATION_MODEL,
    DEFAULT_VOLCENGINE_IMAGE_GENERATION_ENDPOINT,
    SYSTEM_PROMPT_MAX_LENGTH,
    DEFAULT_SYSTEM_PROMPT_FALLBACK,
    RUNTIME_CONTEXT_ROUNDS_MAX,
    RUNTIME_MAX_CONTEXT_WINDOW_TOKENS,
    RUNTIME_MAX_INPUT_TOKENS,
    RUNTIME_MAX_OUTPUT_TOKENS,
    RUNTIME_MAX_REASONING_TOKENS,
    VOLCENGINE_FIXED_SAMPLING_MODEL_ID,
    VOLCENGINE_FIXED_TEMPERATURE,
    VOLCENGINE_FIXED_TOP_P,
    UPLOADED_FILE_CONTEXT_CACHE_TTL_MS,
    GENERATED_IMAGE_HISTORY_TTL_MS,
    GENERATED_IMAGE_HISTORY_MAX_IMAGE_BYTES,
    GENERATED_IMAGE_HISTORY_FETCH_TIMEOUT_MS,
    GROUP_CHAT_MAX_MEMBERS_PER_ROOM,
    GROUP_CHAT_DEFAULT_MESSAGES_LIMIT,
    GROUP_CHAT_MAX_MESSAGES_LIMIT,
    GROUP_CHAT_IMAGE_MAX_FILE_SIZE_BYTES,
    GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
    GROUP_CHAT_FILE_TTL_MS,
    GROUP_CHAT_OSS_DEFAULT_REGION,
    GROUP_CHAT_OSS_DEFAULT_PREFIX,
    GROUP_CHAT_OSS_SIGNED_URL_TTL_SECONDS_DEFAULT,
    GROUP_CHAT_OSS_SIGNED_URL_TTL_SECONDS_MAX,
    GROUP_CHAT_OSS_STARTUP_CHECK_TIMEOUT_MS_DEFAULT,
    GROUP_CHAT_OSS_STARTUP_CHECK_TIMEOUT_MS_MAX,
    GROUP_CHAT_OSS_EXPIRED_CLEANUP_INTERVAL_MS,
    GROUP_CHAT_OSS_EXPIRED_CLEANUP_BATCH_SIZE,
    GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_INTERVAL_MS,
    GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_BATCH_SIZE,
    CHAT_ATTACHMENT_OSS_SCOPE,
    TEACHER_LESSON_FILE_OSS_SCOPE,
    TEACHER_LESSON_FILE_OSS_SUB_SCOPE,
    STUDENT_HOMEWORK_OSS_SUB_SCOPE,
    STUDENT_HOMEWORK_UPLOAD_MAX_FILES,
    STUDENT_HOMEWORK_MAX_FILES_PER_LESSON_PER_STUDENT,
    FIXED_ADMIN_ACCOUNTS,
    FIXED_ADMIN_USERNAME_KEYS,
    FIXED_STUDENT_USERNAME_KEYS,
    RESERVED_ADMIN_USERNAME_KEYS,
    CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE,
    IMAGE_GENERATION_INPUT_OSS_SCOPE,
    IMAGE_GENERATION_OUTPUT_OSS_SCOPE,
    ALIYUN_DASHSCOPE_PDF_IMAGE_MAX_PAGES,
    ALIYUN_DASHSCOPE_PDF_RENDER_DPI,
    ALIYUN_DASHSCOPE_PDF_RENDER_TIMEOUT_MS,
    ALIYUN_DASHSCOPE_PDF_RENDER_STDOUT_MAX_BYTES,
    ALIYUN_DASHSCOPE_PDF_RENDER_SCRIPT_PATH,
    GROUP_CHAT_TEXT_MAX_LENGTH,
    GROUP_CHAT_ROOM_NAME_MAX_LENGTH,
    GROUP_CHAT_REPLY_PREVIEW_MAX_LENGTH,
    GROUP_CHAT_LOCAL_PARSE_HINT_TEXT,
    GROUP_CHAT_MEMBER_MUTED_ERROR_MESSAGE,
    GROUP_CHAT_MAX_REACTIONS_PER_MESSAGE,
    GROUP_CHAT_REACTION_EMOJI_MAX_SYMBOLS,
    GROUP_CHAT_MAX_READ_STATES_PER_ROOM,
    GROUP_CHAT_WS_PATH,
    GROUP_CHAT_WS_AUTH_TIMEOUT_MS,
    GROUP_CHAT_WS_MAX_PAYLOAD_BYTES,
    groupChatOssConfig,
    groupChatOssClient,
    AGENT_D_FIXED_PROVIDER,
    AGENT_D_FIXED_MODEL,
    AGENT_D_FIXED_MAX_OUTPUT_TOKENS,
    AGENT_C_FIXED_PROVIDER,
    GROUP_CHAT_VOLCENGINE_SUPPORTED_IMAGE_EXTENSIONS,
    GROUP_CHAT_VOLCENGINE_SUPPORTED_IMAGE_MIME_TYPES,
    DEFAULT_AGENT_RUNTIME_CONFIG,
    AGENT_RUNTIME_DEFAULT_OVERRIDES,
    AGENT_RUNTIME_DEFAULTS,
    RESPONSE_MODEL_TOKEN_PROFILES,
    VOLCENGINE_WEB_SEARCH_MODEL_CAPABILITIES,
    VOLCENGINE_WEB_SEARCH_THINKING_PROMPT,
    CRC32_TABLE,
    TEXT_EXTENSIONS,
    WORD_EXTENSIONS,
    EXCEL_EXTENSIONS,
    PDF_EXTENSIONS,
    VIDEO_EXTENSIONS,
    groupChatImageUpload,
    groupChatFileUpload,
    AuthUser,
    ChatState,
    UploadedFileContext,
    GeneratedImageHistory,
    GroupChatRoom,
    GroupChatStoredFile,
    GroupChatMessage,
    AdminConfig,
    AdminClassroomLessonFile,
    ClassroomHomeworkFile,
    extractGeneratedImageDataBuffer,
    normalizeMultipartUploadFile,
    sanitizeRuntimeInteger,
    sanitizeRuntimeBoolean,
    requireChatAuth,
    sanitizeId,
    sanitizeText,
    sanitizeIsoDate,
    sanitizeGroupChatRoomName,
    sanitizeGroupChatText,
    sanitizeGroupChatCode,
    sanitizeGroupChatAfterDate,
    buildGroupChatDisplayName,
    generateUniqueGroupChatRoomCode,
    sanitizeGroupChatMutedMemberUserIds,
    normalizeGroupChatRoomDoc,
    isGroupChatMemberMuted,
    classifyGroupChatVolcengineSupportedInputType,
    normalizeGroupChatRoomFileItemFromMessageDoc,
    normalizeGroupChatMessageDoc,
    sanitizeGroupChatImageFileName,
    sanitizeGroupChatFileName,
    buildAttachmentContentDisposition,
    sanitizeGroupChatFileMimeType,
    buildGroupChatFileExpireAt,
    sanitizeAliyunOssBucket,
    sanitizeAliyunOssRegion,
    sanitizeGroupChatFileStorageType,
    sanitizeGroupChatOssObjectKey,
    sanitizeGroupChatHttpUrl,
    uploadChatAttachmentsToOss,
    buildGroupChatOssObjectUrl,
    buildGroupChatFileSignedDownloadUrl,
    buildGroupChatStoredFileStoragePayload,
    deleteGroupChatOssObject,
    deleteGroupChatStoredFileObjects,
    findGroupChatStoredFileByRoomAndId,
    sanitizeGroupChatReactionEmoji,
    normalizeGroupChatReactions,
    toGroupChatDateTimestamp,
    collectGroupChatMemberUserIds,
    readGroupChatUsersByIds,
    createGroupChatSystemMessage,
    collectMentionNames,
    resolveGroupChatReplyMeta,
    markGroupChatRoomReadByMessageId,
    isMongoObjectIdLike,
    clearGroupChatRoomSockets,
    broadcastGroupChatMessageCreated,
    broadcastGroupChatMessageReactionsUpdated,
    broadcastGroupChatMessageDeleted,
    broadcastGroupChatRoomUpdated,
    broadcastGroupChatRoomDissolved,
    broadcastGroupChatMemberJoined,
  } = deps;

  app.get("/api/group-chat/bootstrap", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    if (!userId) {
      res.status(400).json({ error: "无效用户身份。" });
      return;
    }

    try {
      const rooms = await GroupChatRoom.find({ memberUserIds: userId })
        .sort({ updatedAt: -1 })
        .lean();
      const roomItems = rooms
        .map((room) =>
          normalizeGroupChatRoomDoc(room, {
            viewerUserId: userId,
          }),
        )
        .filter(Boolean);
      const memberUserIds = collectGroupChatMemberUserIds(roomItems);
      const memberUsers = await readGroupChatUsersByIds(memberUserIds);

      res.json({
        ok: true,
        me: {
          id: userId,
          name: buildGroupChatDisplayName(req.authUser),
          role: sanitizeText(req.authUser?.role, "user", 20).toLowerCase() === "admin"
            ? "admin"
            : "user",
        },
        limits: {
          maxMembersPerRoom: GROUP_CHAT_MAX_MEMBERS_PER_ROOM,
        },
        users: memberUsers,
        rooms: roomItems,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "读取群聊数据失败，请稍后重试。",
      });
    }
  });

  app.post("/api/group-chat/rooms", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomName = sanitizeGroupChatRoomName(req.body?.name);
    if (!userId) {
      res.status(400).json({ error: "无效用户身份。" });
      return;
    }
    if (!roomName) {
      res.status(400).json({ error: "请输入群名称。" });
      return;
    }

    try {
      const roomCode = await generateUniqueGroupChatRoomCode();
      const roomDoc = await GroupChatRoom.create({
        roomCode,
        name: roomName,
        ownerUserId: userId,
        memberUserIds: [userId],
        memberCount: 1,
      });

      res.json({
        ok: true,
        room: normalizeGroupChatRoomDoc(roomDoc, {
          viewerUserId: userId,
        }),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "创建群聊失败，请稍后重试。",
      });
    }
  });

  app.post("/api/group-chat/rooms/join", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const userRole = sanitizeText(req.authUser?.role, "", 20).toLowerCase();
    const roomCode = sanitizeGroupChatCode(req.body?.roomCode || req.body?.code);
    if (!userId) {
      res.status(400).json({ error: "无效用户身份。" });
      return;
    }
    if (userRole === "admin") {
      res.status(403).json({ error: "管理员账号不支持加入派。" });
      return;
    }
    if (!roomCode) {
      res.status(400).json({ error: "请输入正确的群号（如 327-139-586）。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findOne({ roomCode }).lean();
      if (!room) {
        res.status(404).json({ error: "未找到该群聊，请核对群号。" });
        return;
      }

      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }

      if (normalizedRoom.memberUserIds.includes(userId)) {
        res.json({
          ok: true,
          joined: false,
          room: normalizedRoom,
        });
        return;
      }

      const updated = await GroupChatRoom.findOneAndUpdate(
        {
          _id: normalizedRoom.id,
          memberUserIds: { $ne: userId },
          [`memberUserIds.${Math.max(0, GROUP_CHAT_MAX_MEMBERS_PER_ROOM - 1)}`]: { $exists: false },
          memberCount: { $lt: GROUP_CHAT_MAX_MEMBERS_PER_ROOM },
        },
        {
          $addToSet: { memberUserIds: userId },
          $inc: { memberCount: 1 },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      ).lean();

      if (!updated) {
        const latest = await GroupChatRoom.findById(normalizedRoom.id).lean();
        const latestRoom = normalizeGroupChatRoomDoc(latest, {
          viewerUserId: userId,
        });
        if (!latestRoom) {
          res.status(404).json({ error: "群聊不存在或已失效。" });
          return;
        }
        if (latestRoom.memberUserIds.includes(userId)) {
          res.json({
            ok: true,
            joined: false,
            room: latestRoom,
          });
          return;
        }
        if (latestRoom.memberCount >= GROUP_CHAT_MAX_MEMBERS_PER_ROOM) {
          res.status(409).json({
            error: `该群已满（最多 ${GROUP_CHAT_MAX_MEMBERS_PER_ROOM} 人）。`,
          });
          return;
        }
        res.status(409).json({ error: "加群失败，请稍后重试。" });
        return;
      }

      const roomId = sanitizeId(updated?._id, "");
      const joinedUser = {
        id: userId,
        name: buildGroupChatDisplayName(req.authUser),
      };
      const systemMessageDoc = await createGroupChatSystemMessage({
        roomId,
        content: `${buildGroupChatDisplayName(req.authUser)} 加入了派`,
      });
      if (systemMessageDoc?._id) {
        await markGroupChatRoomReadByMessageId({
          roomId,
          userId,
          messageId: sanitizeId(systemMessageDoc?._id, ""),
        });
      }
      broadcastGroupChatMessageCreated(roomId, systemMessageDoc);
      broadcastGroupChatMemberJoined(roomId, joinedUser);

      res.json({
        ok: true,
        joined: true,
        room: normalizeGroupChatRoomDoc(updated, {
          viewerUserId: userId,
        }),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "加入群聊失败，请稍后重试。",
      });
    }
  });

  app.patch("/api/group-chat/rooms/:roomId", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const nextName = sanitizeGroupChatRoomName(req.body?.name);
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }
    if (!nextName) {
      res.status(400).json({ error: "请输入群名称。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findById(roomId).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }
      if (normalizedRoom.ownerUserId !== userId) {
        res.status(403).json({ error: "仅群主可修改群名称。" });
        return;
      }

      const currentName = sanitizeGroupChatRoomName(normalizedRoom.name);
      if (currentName === nextName) {
        res.json({
          ok: true,
          room: normalizedRoom,
        });
        return;
      }

      const updated = await GroupChatRoom.findByIdAndUpdate(
        roomId,
        {
          $set: {
            name: nextName,
            updatedAt: new Date(),
          },
        },
        { new: true },
      ).lean();
      const updatedRoom = normalizeGroupChatRoomDoc(updated, {
        viewerUserId: userId,
      });
      if (!updatedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }

      const displayName = buildGroupChatDisplayName(req.authUser);
      const systemMessageDoc = await createGroupChatSystemMessage({
        roomId,
        content: `${displayName} 将群名修改为「${nextName}」`,
      });
      broadcastGroupChatMessageCreated(roomId, systemMessageDoc);
      broadcastGroupChatRoomUpdated(roomId, updatedRoom);

      res.json({
        ok: true,
        room: updatedRoom,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "重命名失败，请稍后重试。",
      });
    }
  });

  app.patch("/api/group-chat/rooms/:roomId/announcement", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const announcement = sanitizeText(req.body?.announcement, "", 500);
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findById(roomId).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }
      if (normalizedRoom.ownerUserId !== userId) {
        res.status(403).json({ error: "仅派主可编辑协作任务。" });
        return;
      }
      if (normalizedRoom.announcement === announcement) {
        res.json({ ok: true, room: normalizedRoom });
        return;
      }

      const updated = await GroupChatRoom.findByIdAndUpdate(
        roomId,
        {
          $set: {
            announcement,
            updatedAt: new Date(),
          },
        },
        { new: true },
      ).lean();
      const updatedRoom = normalizeGroupChatRoomDoc(updated, {
        viewerUserId: userId,
      });
      if (!updatedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }

      broadcastGroupChatRoomUpdated(roomId, updatedRoom);
      res.json({ ok: true, room: updatedRoom });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "保存协作任务失败，请稍后重试。",
      });
    }
  });

  app.post(
    "/api/group-chat/rooms/:roomId/announcement/attachments",
    requireChatAuth,
    groupChatFileUpload.single("file"),
    async (req, res) => {
      const userId = sanitizeId(req.authUser?._id, "");
      const roomId = sanitizeId(req.params?.roomId, "");
      const file = req.file;
      if (!userId || !roomId || !file) {
        res.status(400).json({ error: "请选择要上传的任务附件。" });
        return;
      }
      if (!isMongoObjectIdLike(roomId)) {
        res.status(400).json({ error: "无效群聊 ID。" });
        return;
      }
      if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        res.status(400).json({ error: "文件内容为空，无法上传。" });
        return;
      }

      let storedFileDoc = null;
      let uploadedOssKey = "";
      try {
        const room = await GroupChatRoom.findById(roomId).lean();
        const normalizedRoom = normalizeGroupChatRoomDoc(room, { viewerUserId: userId });
        if (!normalizedRoom) {
          res.status(404).json({ error: "群聊不存在或已失效。" });
          return;
        }
        if (normalizedRoom.ownerUserId !== userId) {
          res.status(403).json({ error: "仅派主可上传任务附件。" });
          return;
        }
        if (normalizedRoom.announcementAttachments.length >= 5) {
          res.status(400).json({ error: "任务最多保留 5 个附件。" });
          return;
        }

        const fileName = sanitizeGroupChatFileName(req.body?.fileName || file.originalname);
        const mimeType = sanitizeGroupChatFileMimeType(file.mimetype);
        const size = sanitizeRuntimeInteger(
          file.size,
          file.buffer.length,
          1,
          GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
        );
        const storagePayload = await buildGroupChatStoredFileStoragePayload({
          roomId,
          fileName,
          mimeType,
          fileBuffer: file.buffer,
        });
        uploadedOssKey = sanitizeGroupChatOssObjectKey(storagePayload?.ossKey);
        storedFileDoc = await GroupChatStoredFile.create({
          roomId,
          messageId: "",
          uploaderUserId: userId,
          fileName,
          mimeType,
          size,
          storageType: sanitizeGroupChatFileStorageType(storagePayload?.storageType),
          ossKey: uploadedOssKey,
          ossBucket: sanitizeAliyunOssBucket(storagePayload?.ossBucket),
          ossRegion: sanitizeAliyunOssRegion(storagePayload?.ossRegion),
          fileUrl: sanitizeGroupChatHttpUrl(storagePayload?.fileUrl),
          data: Buffer.alloc(0),
          expiresAt: null,
        });
        const attachmentAiContext = await parseTaskAttachmentAiContext({
          originalname: fileName,
          mimetype: mimeType,
          buffer: file.buffer,
        });
        const attachment = {
          fileId: sanitizeId(storedFileDoc?._id, ""),
          fileName,
          mimeType,
          size,
          ...attachmentAiContext,
        };
        if (!attachment.fileId) throw new Error("公告附件存储失败");

        const updated = await GroupChatRoom.findByIdAndUpdate(
          roomId,
          {
            $push: { announcementAttachments: attachment },
            $set: { updatedAt: new Date() },
          },
          { new: true },
        ).lean();
        const updatedRoom = normalizeGroupChatRoomDoc(updated, { viewerUserId: userId });
        if (!updatedRoom) throw new Error("群聊不存在或已失效。");
        broadcastGroupChatRoomUpdated(roomId, updatedRoom);
        res.json({ ok: true, room: updatedRoom });
      } catch (error) {
        if (storedFileDoc?._id) {
          await GroupChatStoredFile.deleteOne({ _id: storedFileDoc._id }).catch(() => {});
        }
        if (uploadedOssKey) {
          await deleteGroupChatOssObject(uploadedOssKey).catch(() => {});
        }
        res.status(500).json({ error: error?.message || "上传任务附件失败，请稍后重试。" });
      }
    },
  );

  app.delete(
    "/api/group-chat/rooms/:roomId/announcement/attachments/:fileId",
    requireChatAuth,
    async (req, res) => {
      const userId = sanitizeId(req.authUser?._id, "");
      const roomId = sanitizeId(req.params?.roomId, "");
      const fileId = sanitizeId(req.params?.fileId, "");
      if (!userId || !roomId || !fileId || !isMongoObjectIdLike(roomId) || !isMongoObjectIdLike(fileId)) {
        res.status(400).json({ error: "无效参数。" });
        return;
      }
      try {
        const room = await GroupChatRoom.findById(roomId).lean();
        const normalizedRoom = normalizeGroupChatRoomDoc(room, { viewerUserId: userId });
        if (!normalizedRoom) {
          res.status(404).json({ error: "群聊不存在或已失效。" });
          return;
        }
        if (normalizedRoom.ownerUserId !== userId) {
          res.status(403).json({ error: "仅派主可删除任务附件。" });
          return;
        }
        if (!normalizedRoom.announcementAttachments.some((item) => item.fileId === fileId)) {
          res.status(404).json({ error: "任务附件不存在或已删除。" });
          return;
        }
        const storedFileDoc = await findGroupChatStoredFileByRoomAndId({
          roomId,
          fileId,
          projection: { _id: 1, ossKey: 1 },
        });
        const updated = await GroupChatRoom.findByIdAndUpdate(
          roomId,
          {
            $pull: { announcementAttachments: { fileId } },
            $set: { updatedAt: new Date() },
          },
          { new: true },
        ).lean();
        if (storedFileDoc?._id) {
          await Promise.all([
            deleteGroupChatStoredFileObjects([storedFileDoc]),
            GroupChatStoredFile.deleteOne({ _id: storedFileDoc._id }),
          ]);
        }
        const updatedRoom = normalizeGroupChatRoomDoc(updated, { viewerUserId: userId });
        if (!updatedRoom) throw new Error("群聊不存在或已失效。");
        broadcastGroupChatRoomUpdated(roomId, updatedRoom);
        res.json({ ok: true, room: updatedRoom });
      } catch (error) {
        res.status(500).json({ error: error?.message || "删除任务附件失败，请稍后重试。" });
      }
    },
  );

  app.patch("/api/group-chat/rooms/:roomId/party-agent-access", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const nextEnabled = sanitizeRuntimeBoolean(req.body?.partyAgentMemberEnabled, true);
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findById(roomId).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }
      if (normalizedRoom.ownerUserId !== userId) {
        res.status(403).json({ error: "仅派主可设置派Agent成员权限。" });
        return;
      }

      if (normalizedRoom.partyAgentMemberEnabled === nextEnabled) {
        res.json({
          ok: true,
          room: normalizedRoom,
        });
        return;
      }

      const updated = await GroupChatRoom.findByIdAndUpdate(
        roomId,
        {
          $set: {
            partyAgentMemberEnabled: nextEnabled,
            updatedAt: new Date(),
          },
        },
        { new: true },
      ).lean();
      const updatedRoom = normalizeGroupChatRoomDoc(updated, {
        viewerUserId: userId,
      });
      if (!updatedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }

      broadcastGroupChatRoomUpdated(roomId, updatedRoom);

      res.json({
        ok: true,
        room: updatedRoom,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "更新派Agent成员权限失败，请稍后重试。",
      });
    }
  });

  app.patch("/api/group-chat/rooms/:roomId/members/:memberUserId/mute", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const targetMemberUserId = sanitizeId(req.params?.memberUserId, "");
    const nextMuted = sanitizeRuntimeBoolean(req.body?.muted, true);
    if (!userId || !roomId || !targetMemberUserId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findById(roomId).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }
      if (normalizedRoom.ownerUserId !== userId) {
        res.status(403).json({ error: "仅派主可管理成员禁言。" });
        return;
      }
      if (!normalizedRoom.memberUserIds.includes(targetMemberUserId)) {
        res.status(404).json({ error: "成员不存在或已离开当前派。" });
        return;
      }
      if (targetMemberUserId === normalizedRoom.ownerUserId) {
        res.status(400).json({ error: "不能对派主设置禁言。" });
        return;
      }

      const currentlyMuted = normalizedRoom.mutedMemberUserIds.includes(targetMemberUserId);
      if (currentlyMuted === nextMuted) {
        res.json({
          ok: true,
          room: normalizedRoom,
        });
        return;
      }

      const nextMutedMemberUserIds = new Set(normalizedRoom.mutedMemberUserIds);
      if (nextMuted) {
        nextMutedMemberUserIds.add(targetMemberUserId);
      } else {
        nextMutedMemberUserIds.delete(targetMemberUserId);
      }

      const updated = await GroupChatRoom.findByIdAndUpdate(
        roomId,
        {
          $set: {
            mutedMemberUserIds: sanitizeGroupChatMutedMemberUserIds(
              Array.from(nextMutedMemberUserIds),
              normalizedRoom.memberUserIds,
              normalizedRoom.ownerUserId,
            ),
            updatedAt: new Date(),
          },
        },
        { new: true },
      ).lean();
      const updatedRoom = normalizeGroupChatRoomDoc(updated, {
        viewerUserId: userId,
      });
      if (!updatedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }

      broadcastGroupChatRoomUpdated(roomId, updatedRoom);

      res.json({
        ok: true,
        room: updatedRoom,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "更新成员禁言状态失败，请稍后重试。",
      });
    }
  });

  app.delete("/api/group-chat/rooms/:roomId", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findById(roomId).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
        return;
      }
      if (normalizedRoom.ownerUserId !== userId) {
        res.status(403).json({ error: "仅群主可解散群聊。" });
        return;
      }

      const storedFileDocs = await GroupChatStoredFile.find(
        { roomId },
        { _id: 1, ossKey: 1 },
      ).lean();
      await Promise.all([
        deleteGroupChatStoredFileObjects(storedFileDocs),
        GroupChatRoom.deleteOne({ _id: roomId }),
        GroupChatMessage.deleteMany({ roomId }),
        GroupChatStoredFile.deleteMany({ roomId }),
      ]);

      broadcastGroupChatRoomDissolved(roomId, {
        id: userId,
        name: buildGroupChatDisplayName(req.authUser),
      });
      clearGroupChatRoomSockets(roomId);

      res.json({
        ok: true,
        roomId,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "解散群聊失败，请稍后重试。",
      });
    }
  });

  app.get("/api/group-chat/rooms/:roomId/messages", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(403).json({ error: "你不在该群聊中，无法查看消息。" });
        return;
      }

      const limit = sanitizeRuntimeInteger(
        req.query?.limit,
        GROUP_CHAT_DEFAULT_MESSAGES_LIMIT,
        1,
        GROUP_CHAT_MAX_MESSAGES_LIMIT,
      );
      const afterDate = sanitizeGroupChatAfterDate(req.query?.after);

      let docs = [];
      if (afterDate) {
        docs = await GroupChatMessage.find({
          roomId,
          createdAt: { $gt: afterDate },
        })
          .sort({ createdAt: 1 })
          .limit(limit)
          .lean();
      } else {
        docs = await GroupChatMessage.find({ roomId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        docs.reverse();
      }

      res.json({
        ok: true,
        room: normalizedRoom,
        messages: docs.map((item) => normalizeGroupChatMessageDoc(item)).filter(Boolean),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "读取群聊消息失败，请稍后重试。",
      });
    }
  });

  app.get("/api/group-chat/rooms/:roomId/files", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }).lean();
      if (!room) {
        res.status(403).json({ error: "你不在该群聊中，无法查看文件列表。" });
        return;
      }

      const docs = await GroupChatMessage.find({
        roomId,
        type: { $in: ["file", "image"] },
      })
        .sort({ createdAt: -1 })
        .limit(240)
        .lean();
      const items = docs
        .map((item) => normalizeGroupChatRoomFileItemFromMessageDoc(item))
        .filter(Boolean)
        .sort((a, b) => toGroupChatDateTimestamp(b.createdAt) - toGroupChatDateTimestamp(a.createdAt));

      res.json({
        ok: true,
        roomId,
        files: items,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "读取群聊文件列表失败，请稍后重试。",
      });
    }
  });

  app.post("/api/group-chat/rooms/:roomId/read", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const messageId = sanitizeId(req.body?.messageId || req.body?.lastMessageId, "");
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }).lean();
      if (!room) {
        res.status(403).json({ error: "你不在该群聊中，无法更新已读状态。" });
        return;
      }

      const updatedRoom = await markGroupChatRoomReadByMessageId({
        roomId,
        userId,
        messageId,
      });
      const nextRoomDoc = updatedRoom || room;
      const normalizedRoom = normalizeGroupChatRoomDoc(nextRoomDoc, {
        viewerUserId: userId,
      });

      res.json({
        ok: true,
        room: normalizedRoom,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "更新已读状态失败，请稍后重试。",
      });
    }
  });

  app.post("/api/group-chat/rooms/:roomId/messages/text", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const content = sanitizeGroupChatText(req.body?.content);
    if (!userId || !roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }
    if (!content) {
      res.status(400).json({ error: "消息不能为空。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room, {
        viewerUserId: userId,
      });
      if (!normalizedRoom) {
        res.status(403).json({ error: "你不在该群聊中，无法发送消息。" });
        return;
      }
      if (isGroupChatMemberMuted(normalizedRoom, userId)) {
        res.status(403).json({ error: GROUP_CHAT_MEMBER_MUTED_ERROR_MESSAGE });
        return;
      }

      const replyMeta = await resolveGroupChatReplyMeta({
        roomId,
        rawReplyToMessageId: req.body?.replyToMessageId,
      });
      const mentionNames = collectMentionNames(content);
      const senderName = buildGroupChatDisplayName(req.authUser);

      const messageDoc = await GroupChatMessage.create({
        roomId,
        type: "text",
        senderUserId: userId,
        senderName,
        content,
        replyToMessageId: replyMeta.replyToMessageId,
        replyPreviewText: replyMeta.replyPreviewText,
        replySenderName: replyMeta.replySenderName,
        replyType: replyMeta.replyType,
        mentionNames,
      });

      await GroupChatRoom.findByIdAndUpdate(roomId, { $set: { updatedAt: new Date() } });
      await markGroupChatRoomReadByMessageId({
        roomId,
        userId,
        messageId: sanitizeId(messageDoc?._id, ""),
      });
      const normalizedMessage = normalizeGroupChatMessageDoc(messageDoc);
      if (!normalizedMessage) {
        throw new Error("消息格式化失败");
      }
      broadcastGroupChatMessageCreated(roomId, normalizedMessage);

      if (isGroupChatAiMentionRequested(content)) {
        const recentDocs = await GroupChatMessage.find({ roomId })
          .sort({ createdAt: -1 })
          .limit(24)
          .lean();
        recentDocs.reverse();
        const recentMessages = recentDocs
          .map((item) => normalizeGroupChatMessageDoc(item))
          .filter(Boolean);
        const contextSnapshot = buildGroupChatAiContextSnapshot({
          room,
          triggerMessage: normalizedMessage,
          recentMessages,
        });
        const redis = getGroupChatAiRedisClient(process.env);
        const redisPrefix = getGroupChatAiRedisPrefix(process.env);
        const duplicateHash = crypto
          .createHash("sha1")
          .update(`${roomId}::${userId}::${contextSnapshot.userQuestion}`)
          .digest("hex");

        let queueDecision = {
          accepted: false,
          code: "redis_unavailable",
          message: "AI 队列服务暂不可用，请稍后再试。",
        };
        if (redis) {
          queueDecision = await reserveGroupChatAiPendingCapacity(redis, {
            prefix: redisPrefix,
            roomId,
            userId,
            duplicateHash,
          });
        }

        if (!queueDecision.accepted) {
          const failedReplyDoc = await GroupChatMessage.create({
            ...buildGroupChatAiFailedReplyDraft({
              roomId,
              triggerMessageId: normalizedMessage.id,
              requestedByUserId: userId,
              errorMessage: queueDecision.message,
            }),
            replyPreviewText: content.slice(0, 80),
            replySenderName: senderName,
            replyType: "text",
          });
          const normalizedFailedReply = normalizeGroupChatMessageDoc(failedReplyDoc);
          if (normalizedFailedReply) {
            broadcastGroupChatMessageCreated(roomId, normalizedFailedReply);
          }
        } else {
          const taskId = String(new mongoose.Types.ObjectId());
          const placeholderMessageId = String(new mongoose.Types.ObjectId());
          const placeholderDraft = buildGroupChatAiPendingReplyDraft({
            roomId,
            triggerMessageId: normalizedMessage.id,
            requestedByUserId: userId,
          });

          let placeholderDoc = null;
          let taskDoc = null;
          try {
            placeholderDoc = await GroupChatMessage.create({
              _id: placeholderMessageId,
              ...placeholderDraft,
              replyPreviewText: content.slice(0, 80),
              replySenderName: senderName,
              replyType: "text",
              aiMeta: {
                ...placeholderDraft.aiMeta,
                taskId,
              },
            });
            taskDoc = await GroupChatAiTask.create({
              _id: taskId,
              roomId,
              triggerMessageId: normalizedMessage.id,
              placeholderMessageId,
              requestedByUserId: userId,
              requestedByUserName: senderName,
              agentId: "A",
              provider: "packycode",
              model: "gpt-5.4",
              status: "pending",
              contextSnapshot,
              attachmentRefs: Array.isArray(contextSnapshot.attachmentMessages)
                ? contextSnapshot.attachmentMessages.map((item) => ({
                    messageId: item.id,
                    type: item.type,
                    fileId: item?.file?.fileId || "",
                    fileName: item?.file?.fileName || item?.image?.fileName || "",
                  }))
                : [],
              queueJobId: taskId,
              attemptCount: 0,
              lastQueuedAt: new Date(),
            });
            await enqueueGroupChatAiTaskId(redis, {
              prefix: redisPrefix,
              taskId,
            });
            const normalizedPlaceholder = normalizeGroupChatMessageDoc(placeholderDoc);
            if (normalizedPlaceholder) {
              broadcastGroupChatMessageCreated(roomId, normalizedPlaceholder);
            }
          } catch {
            await rollbackGroupChatAiPendingCapacity(redis, {
              prefix: redisPrefix,
              roomId,
              userId,
              duplicateHash,
            }).catch(() => {});
            if (taskDoc?._id) {
              await GroupChatAiTask.findByIdAndUpdate(taskDoc._id, {
                $set: {
                  status: "failed",
                  finishedAt: new Date(),
                  lastError: "AI 队列创建失败，请稍后再试。",
                  leaseUntil: null,
                  dequeuedAt: null,
                },
              }).catch(() => {});
            }
            if (placeholderDoc?._id) {
              const failedPlaceholder = await GroupChatMessage.findByIdAndUpdate(
                placeholderDoc._id,
                {
                  $set: {
                    content: "AI 队列创建失败，请稍后再试。",
                    aiMeta: {
                      taskId,
                      agentId: "A",
                      provider: "packycode",
                      model: "gpt-5.4",
                      requestedByUserId: userId,
                      triggerMessageId: normalizedMessage.id,
                      status: "failed",
                      streaming: false,
                      error: "AI 队列创建失败，请稍后再试。",
                    },
                  },
                },
                { new: true },
              ).lean();
              const normalizedFailedPlaceholder =
                normalizeGroupChatMessageDoc(failedPlaceholder);
              if (normalizedFailedPlaceholder) {
                broadcastGroupChatMessageCreated(roomId, normalizedFailedPlaceholder);
              }
            }
          }
        }
      }

      res.json({
        ok: true,
        message: normalizedMessage,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "发送消息失败，请稍后重试。",
      });
    }
  });

  app.post(
    "/api/group-chat/rooms/:roomId/messages/image",
    requireChatAuth,
    groupChatImageUpload.single("image"),
    async (req, res) => {
      const userId = sanitizeId(req.authUser?._id, "");
      const roomId = sanitizeId(req.params?.roomId, "");
      if (!userId || !roomId) {
        res.status(400).json({ error: "无效参数。" });
        return;
      }
      if (!isMongoObjectIdLike(roomId)) {
        res.status(400).json({ error: "无效群聊 ID。" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "请选择图片后再发送。" });
        return;
      }
      const fileName = sanitizeGroupChatImageFileName(req.body?.fileName || file.originalname);
      const mimeType = sanitizeGroupChatFileMimeType(file.mimetype).toLowerCase();
      if (!mimeType.startsWith("image/")) {
        res.status(400).json({ error: "仅支持图片格式文件。" });
        return;
      }
      let uploadedImageOssKey = "";
      try {
        const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }).lean();
        const normalizedRoom = normalizeGroupChatRoomDoc(room, {
          viewerUserId: userId,
        });
        if (!normalizedRoom) {
          res.status(403).json({ error: "你不在该群聊中，无法发送消息。" });
          return;
        }
        if (isGroupChatMemberMuted(normalizedRoom, userId)) {
          res.status(403).json({ error: GROUP_CHAT_MEMBER_MUTED_ERROR_MESSAGE });
          return;
        }

        const replyMeta = await resolveGroupChatReplyMeta({
          roomId,
          rawReplyToMessageId: req.body?.replyToMessageId,
        });
        const senderName = buildGroupChatDisplayName(req.authUser);
        const uploadFile = normalizeMultipartUploadFile({
          ...file,
          originalname: fileName,
          mimetype: mimeType,
        });
        if (!uploadFile || !Buffer.isBuffer(uploadFile.buffer) || uploadFile.buffer.length === 0) {
          res.status(400).json({ error: "图片内容为空，无法发送。" });
          return;
        }
        const ossUploadedList = await uploadChatAttachmentsToOss({
          files: [uploadFile],
          userId,
          sessionId: roomId,
          source: "group-chat-image-message",
        });
        const uploadedOss = ossUploadedList[0] || null;
        uploadedImageOssKey = sanitizeGroupChatOssObjectKey(uploadedOss?.ossKey);
        if (!uploadedOss || !uploadedImageOssKey) {
          throw new Error("上传图片到 OSS 失败，请稍后重试。");
        }
        const dataUrl = `data:${mimeType};base64,${uploadFile.buffer.toString("base64")}`;

        const messageDoc = await GroupChatMessage.create({
          roomId,
          type: "image",
          senderUserId: userId,
          senderName,
          content: "",
          image: {
            dataUrl,
            mimeType,
            fileName,
            size: Number(file.size) || 0,
            filesApi: {
              status: "not_supported",
              fileId: "",
              inputType: "input_image",
              uploadedAt: null,
              expiresAt: null,
            },
            oss: {
              uploaded: !!uploadedOss,
              ossKey: sanitizeGroupChatOssObjectKey(uploadedOss?.ossKey),
              ossBucket: sanitizeAliyunOssBucket(uploadedOss?.ossBucket),
              ossRegion: sanitizeAliyunOssRegion(uploadedOss?.ossRegion),
              fileUrl: sanitizeGroupChatHttpUrl(uploadedOss?.fileUrl),
            },
          },
          replyToMessageId: replyMeta.replyToMessageId,
          replyPreviewText: replyMeta.replyPreviewText,
          replySenderName: replyMeta.replySenderName,
          replyType: replyMeta.replyType,
        });

        await GroupChatRoom.findByIdAndUpdate(roomId, { $set: { updatedAt: new Date() } });
        await markGroupChatRoomReadByMessageId({
          roomId,
          userId,
          messageId: sanitizeId(messageDoc?._id, ""),
        });
        const normalizedMessage = normalizeGroupChatMessageDoc(messageDoc);
        if (!normalizedMessage) {
          throw new Error("消息格式化失败");
        }
        broadcastGroupChatMessageCreated(roomId, normalizedMessage);

        res.json({
          ok: true,
          message: normalizedMessage,
        });
      } catch (error) {
        if (uploadedImageOssKey) {
          await deleteGroupChatOssObject(uploadedImageOssKey).catch(() => {});
        }
        res.status(500).json({
          error: error?.message || "发送图片失败，请稍后重试。",
        });
      }
    },
  );

  app.post(
    "/api/group-chat/rooms/:roomId/messages/file",
    requireChatAuth,
    groupChatFileUpload.single("file"),
    async (req, res) => {
      const userId = sanitizeId(req.authUser?._id, "");
      const roomId = sanitizeId(req.params?.roomId, "");
      if (!userId || !roomId) {
        res.status(400).json({ error: "无效参数。" });
        return;
      }
      if (!isMongoObjectIdLike(roomId)) {
        res.status(400).json({ error: "无效群聊 ID。" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "请选择文件后再发送。" });
        return;
      }
      if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        res.status(400).json({ error: "文件内容为空，无法发送。" });
        return;
      }

      const fileName = sanitizeGroupChatFileName(req.body?.fileName || file.originalname);
      const mimeType = sanitizeGroupChatFileMimeType(file.mimetype);
      const fileSize = sanitizeRuntimeInteger(
        file.size,
        file.buffer.length,
        1,
        GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
      );
      const expiresAt = buildGroupChatFileExpireAt();
      let storedFileDoc = null;
      let createdMessageId = "";
      let uploadedOssKey = "";
      const filesApiInputType = classifyGroupChatVolcengineSupportedInputType({
        fileName,
        mimeType,
      });
      const filesApiSupported =
        filesApiInputType === "input_file" || filesApiInputType === "input_image";
      const filesApiMeta = {
        status: "not_supported",
        fileId: "",
        inputType: filesApiInputType || "",
        uploadedAt: null,
        expiresAt: null,
      };
      const localParseOnly = !filesApiSupported;
      const parseHint = localParseOnly ? GROUP_CHAT_LOCAL_PARSE_HINT_TEXT : "";

      try {
        const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }).lean();
        const normalizedRoom = normalizeGroupChatRoomDoc(room, {
          viewerUserId: userId,
        });
        if (!normalizedRoom) {
          res.status(403).json({ error: "你不在该群聊中，无法发送文件。" });
          return;
        }
        if (isGroupChatMemberMuted(normalizedRoom, userId)) {
          res.status(403).json({ error: GROUP_CHAT_MEMBER_MUTED_ERROR_MESSAGE });
          return;
        }

        const replyMeta = await resolveGroupChatReplyMeta({
          roomId,
          rawReplyToMessageId: req.body?.replyToMessageId,
        });
        const senderName = buildGroupChatDisplayName(req.authUser);
        const storagePayload = await buildGroupChatStoredFileStoragePayload({
          roomId,
          fileName,
          mimeType,
          fileBuffer: file.buffer,
        });
        uploadedOssKey = sanitizeGroupChatOssObjectKey(storagePayload?.ossKey);

        storedFileDoc = await GroupChatStoredFile.create({
          roomId,
          messageId: "",
          uploaderUserId: userId,
          fileName,
          mimeType,
          size: fileSize,
          storageType: sanitizeGroupChatFileStorageType(storagePayload?.storageType),
          ossKey: uploadedOssKey,
          ossBucket: sanitizeAliyunOssBucket(storagePayload?.ossBucket),
          ossRegion: sanitizeAliyunOssRegion(storagePayload?.ossRegion),
          fileUrl: sanitizeGroupChatHttpUrl(storagePayload?.fileUrl),
          data:
            sanitizeGroupChatFileStorageType(storagePayload?.storageType) === "oss"
              ? Buffer.alloc(0)
              : file.buffer,
          expiresAt,
        });
        const fileId = sanitizeId(storedFileDoc?._id, "");
        if (!fileId) {
          throw new Error("文件存储失败");
        }

        const messageDoc = await GroupChatMessage.create({
          roomId,
          type: "file",
          senderUserId: userId,
          senderName,
          content: "",
          file: {
            fileId,
            fileName,
            mimeType,
            size: fileSize,
            expiresAt,
            localParseOnly,
            parseHint,
            filesApi: filesApiMeta,
            oss: {
              uploaded: sanitizeGroupChatFileStorageType(storagePayload?.storageType) === "oss",
              ossKey: sanitizeGroupChatOssObjectKey(storagePayload?.ossKey),
              ossBucket: sanitizeAliyunOssBucket(storagePayload?.ossBucket),
              ossRegion: sanitizeAliyunOssRegion(storagePayload?.ossRegion),
              fileUrl: sanitizeGroupChatHttpUrl(storagePayload?.fileUrl),
            },
          },
          replyToMessageId: replyMeta.replyToMessageId,
          replyPreviewText: replyMeta.replyPreviewText,
          replySenderName: replyMeta.replySenderName,
          replyType: replyMeta.replyType,
        });
        createdMessageId = sanitizeId(messageDoc?._id, "");

        await Promise.all([
          GroupChatStoredFile.findByIdAndUpdate(fileId, {
            $set: {
              messageId: createdMessageId,
            },
          }),
          GroupChatRoom.findByIdAndUpdate(roomId, { $set: { updatedAt: new Date() } }),
        ]);
        await markGroupChatRoomReadByMessageId({
          roomId,
          userId,
          messageId: createdMessageId,
        });
        const normalizedMessage = normalizeGroupChatMessageDoc(messageDoc);
        if (!normalizedMessage) {
          throw new Error("消息格式化失败");
        }
        broadcastGroupChatMessageCreated(roomId, normalizedMessage);

        res.json({
          ok: true,
          message: normalizedMessage,
        });
      } catch (error) {
        if (storedFileDoc?._id && !createdMessageId) {
          await GroupChatStoredFile.deleteOne({ _id: storedFileDoc._id }).catch(() => {});
        }
        if (!createdMessageId && uploadedOssKey) {
          await deleteGroupChatOssObject(uploadedOssKey).catch(() => {});
        }
        res.status(500).json({
          error: error?.message || "发送文件失败，请稍后重试。",
        });
      }
    },
  );

  app.get("/api/group-chat/rooms/:roomId/files/:fileId/download", requireChatAuth, async (req, res) => {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    const fileId = sanitizeId(req.params?.fileId, "");
    if (!userId || !roomId || !fileId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId) || !isMongoObjectIdLike(fileId)) {
      res.status(400).json({ error: "无效群聊或文件 ID。" });
      return;
    }

    try {
      const hasMembership = await GroupChatRoom.exists({ _id: roomId, memberUserIds: userId });
      if (!hasMembership) {
        res.status(403).json({ error: "你不在该群聊中，无法下载文件。" });
        return;
      }

      const storedFileDoc = await findGroupChatStoredFileByRoomAndId({ roomId, fileId });
      const now = Date.now();
      if (!storedFileDoc) {
        res.status(404).json({ error: "文件不存在或已删除。" });
        return;
      }

      const fileStorageType = sanitizeGroupChatFileStorageType(storedFileDoc?.storageType);
      const fileExpiredAt = sanitizeIsoDate(storedFileDoc?.expiresAt);
      if (
        fileStorageType !== "oss" &&
        fileExpiredAt &&
        toGroupChatDateTimestamp(fileExpiredAt) <= now
      ) {
        res.status(410).json({ error: "文件已过期。" });
        return;
      }

      const downloadName = sanitizeGroupChatFileName(storedFileDoc.fileName);
      const contentType = sanitizeGroupChatFileMimeType(storedFileDoc.mimeType);
      const ossKey = sanitizeGroupChatOssObjectKey(storedFileDoc?.ossKey);
      if (ossKey) {
        const directUrl =
          sanitizeGroupChatHttpUrl(storedFileDoc?.fileUrl) || buildGroupChatOssObjectUrl(ossKey);
        if ((groupChatOssConfig?.publicRead || !groupChatOssClient) && directUrl) {
          res.json({
            ok: true,
            downloadUrl: directUrl,
            fileName: downloadName,
            mimeType: contentType,
          });
          return;
        }

        const signedUrl = await buildGroupChatFileSignedDownloadUrl({
          ossKey,
          fileName: downloadName,
        });
        if (!signedUrl) {
          res.status(500).json({ error: "文件下载地址生成失败，请稍后重试。" });
          return;
        }
        res.json({
          ok: true,
          downloadUrl: signedUrl,
          fileName: downloadName,
          mimeType: contentType,
        });
        return;
      }

      const directUrl = sanitizeGroupChatHttpUrl(storedFileDoc?.fileUrl);
      if (directUrl) {
        res.json({
          ok: true,
          downloadUrl: directUrl,
          fileName: downloadName,
          mimeType: contentType,
        });
        return;
      }

      const dataBuffer = extractGeneratedImageDataBuffer(storedFileDoc?.data);
      if (dataBuffer.length === 0) {
        res.status(404).json({ error: "文件不存在或已删除。" });
        return;
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(dataBuffer.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(downloadName));
      res.send(dataBuffer);
    } catch (error) {
      res.status(500).json({
        error: error?.message || "下载文件失败，请稍后重试。",
      });
    }
  });

  app.delete(
    "/api/group-chat/rooms/:roomId/messages/:messageId/file",
    requireChatAuth,
    async (req, res) => {
      const userId = sanitizeId(req.authUser?._id, "");
      const roomId = sanitizeId(req.params?.roomId, "");
      const messageId = sanitizeId(req.params?.messageId, "");
      if (!userId || !roomId || !messageId) {
        res.status(400).json({ error: "无效参数。" });
        return;
      }
      if (!isMongoObjectIdLike(roomId) || !isMongoObjectIdLike(messageId)) {
        res.status(400).json({ error: "无效群聊或消息 ID。" });
        return;
      }

      try {
        const [room, messageDoc] = await Promise.all([
          GroupChatRoom.findOne(
            { _id: roomId, memberUserIds: userId },
            { ownerUserId: 1 },
          ).lean(),
          GroupChatMessage.findOne({ _id: messageId, roomId }).lean(),
        ]);
        if (!room) {
          res.status(403).json({ error: "你不在该群聊中，无法删除文件。" });
          return;
        }
        if (!messageDoc) {
          res.status(404).json({ error: "消息不存在或已删除。" });
          return;
        }
        const messageType = sanitizeText(messageDoc.type, "", 20).toLowerCase();
        if (messageType !== "file") {
          res.status(400).json({ error: "该消息不是文件消息。" });
          return;
        }

        const ownerUserId = sanitizeId(room?.ownerUserId, "");
        const senderUserId = sanitizeId(messageDoc?.senderUserId, "");
        const canDelete = userId === senderUserId || (ownerUserId && ownerUserId === userId);
        if (!canDelete) {
          res.status(403).json({ error: "仅文件发送者或派主可删除该文件。" });
          return;
        }

        const fileId = sanitizeId(messageDoc?.file?.fileId, "");
        if (fileId && isMongoObjectIdLike(fileId)) {
          const storedFileDoc = await findGroupChatStoredFileByRoomAndId({
            roomId,
            fileId,
            projection: { _id: 1, ossKey: 1 },
          });
          if (storedFileDoc?._id) {
            await Promise.all([
              deleteGroupChatStoredFileObjects([storedFileDoc]),
              GroupChatStoredFile.deleteOne({ _id: storedFileDoc._id }),
            ]);
          }
        } else {
          const storedFileDocs = await GroupChatStoredFile.find(
            { roomId, messageId },
            { _id: 1, ossKey: 1 },
          ).lean();
          await Promise.all([
            deleteGroupChatStoredFileObjects(storedFileDocs),
            GroupChatStoredFile.deleteMany({ roomId, messageId }),
          ]);
        }
        await Promise.all([
          GroupChatMessage.deleteOne({ _id: messageId, roomId }),
          GroupChatRoom.findByIdAndUpdate(roomId, { $set: { updatedAt: new Date() } }),
        ]);

        broadcastGroupChatMessageDeleted(roomId, messageId);
        res.json({
          ok: true,
          roomId,
          messageId,
        });
      } catch (error) {
        res.status(500).json({
          error: error?.message || "删除文件失败，请稍后重试。",
        });
      }
    },
  );

  app.post(
    "/api/group-chat/rooms/:roomId/messages/:messageId/reactions/toggle",
    requireChatAuth,
    async (req, res) => {
      const userId = sanitizeId(req.authUser?._id, "");
      const roomId = sanitizeId(req.params?.roomId, "");
      const messageId = sanitizeId(req.params?.messageId, "");
      const emoji = sanitizeGroupChatReactionEmoji(req.body?.emoji);
      if (!userId || !roomId || !messageId) {
        res.status(400).json({ error: "无效参数。" });
        return;
      }
      if (!isMongoObjectIdLike(roomId) || !isMongoObjectIdLike(messageId)) {
        res.status(400).json({ error: "无效群聊或消息 ID。" });
        return;
      }
      if (!emoji) {
        res.status(400).json({ error: "请选择一个有效表情。" });
        return;
      }

      try {
        const hasMembership = await GroupChatRoom.exists({ _id: roomId, memberUserIds: userId });
        if (!hasMembership) {
          res.status(403).json({ error: "你不在该群聊中，无法添加表情回复。" });
          return;
        }

        const messageDoc = await GroupChatMessage.findOne({ _id: messageId, roomId });
        if (!messageDoc) {
          res.status(404).json({ error: "消息不存在或已被删除。" });
          return;
        }

        const messageType = sanitizeText(messageDoc.type, "", 20).toLowerCase();
        if (messageType === "system") {
          res.status(400).json({ error: "系统消息不支持表情回复。" });
          return;
        }

        const currentReactions = normalizeGroupChatReactions(messageDoc.reactions);
        const existingReaction = currentReactions.find((item) => item.userId === userId);
        const nextReactions = currentReactions.filter((item) => item.userId !== userId);

        if (!existingReaction || existingReaction.emoji !== emoji) {
          nextReactions.push({
            emoji,
            userId,
            userName: buildGroupChatDisplayName(req.authUser),
            createdAt: new Date().toISOString(),
          });
        }

        messageDoc.reactions = nextReactions.slice(-GROUP_CHAT_MAX_REACTIONS_PER_MESSAGE).map((item) => ({
          emoji: item.emoji,
          userId: item.userId,
          userName: item.userName,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        }));
        await messageDoc.save();

        const normalizedMessage = normalizeGroupChatMessageDoc(messageDoc);
        if (!normalizedMessage) {
          throw new Error("消息格式化失败");
        }

        broadcastGroupChatMessageReactionsUpdated(roomId, normalizedMessage);

        res.json({
          ok: true,
          messageId: normalizedMessage.id,
          reactions: normalizedMessage.reactions,
        });
      } catch (error) {
        res.status(500).json({
          error: error?.message || "表情回复失败，请稍后重试。",
        });
      }
    },
  );
}
