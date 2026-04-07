import { createAppContext } from "../server/app/createAppContext.js";

function readFlag(name) {
  return process.argv.includes(name);
}

function readArgValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((item) => String(item || "").startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function buildScopeList(doc, deps) {
  const scopes = [];
  if (deps.readChatStateShape(doc)) {
    scopes.push(deps.DEFAULT_TEACHER_SCOPE_KEY);
  }

  const teacherStates =
    doc?.teacherStates && typeof doc.teacherStates === "object"
      ? doc.teacherStates
      : {};
  Object.keys(teacherStates).forEach((scopeKey) => {
    if (deps.readTeacherScopedChatStateRaw(doc, scopeKey)) {
      scopes.push(scopeKey);
    }
  });

  return Array.from(new Set(scopes));
}

function normalizeName(deps, value) {
  return deps.sanitizeGroupChatFileName(value || "");
}

function normalizeMime(deps, value) {
  return deps.sanitizeGroupChatFileMimeType(value || "");
}

function normalizeSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.round(numeric));
}

function matchAttachmentOssFile(deps, attachment, ossFiles, attachmentIndex) {
  const safeFiles = Array.isArray(ossFiles) ? ossFiles : [];
  if (safeFiles.length === 0) return null;

  const attachmentName = normalizeName(deps, attachment?.name);
  const attachmentMime = normalizeMime(deps, attachment?.type);
  const attachmentSize = normalizeSize(attachment?.size);

  const matchedByMeta =
    safeFiles.find((item) => {
      const sameName = normalizeName(deps, item?.fileName) === attachmentName && !!attachmentName;
      const sameMime = normalizeMime(deps, item?.mimeType) === attachmentMime && !!attachmentMime;
      const sameSize = normalizeSize(item?.size) === attachmentSize && attachmentSize > 0;
      return sameName || (sameMime && sameSize);
    }) || null;

  if (matchedByMeta) return matchedByMeta;
  if (attachmentIndex >= 0 && attachmentIndex < safeFiles.length) {
    return safeFiles[attachmentIndex];
  }
  return null;
}

function patchAttachmentWithOss(deps, attachment, matchedOssFile) {
  const currentUrl = deps.sanitizeGroupChatHttpUrl(
    attachment?.url || attachment?.fileUrl || "",
  );
  const currentOssKey = deps.sanitizeGroupChatOssObjectKey(attachment?.ossKey);
  const nextUrl =
    currentUrl || deps.sanitizeGroupChatHttpUrl(matchedOssFile?.fileUrl || "");
  const nextOssKey =
    currentOssKey || deps.sanitizeGroupChatOssObjectKey(matchedOssFile?.ossKey);

  if (currentUrl === nextUrl && currentOssKey === nextOssKey) {
    return { changed: false, attachment };
  }

  return {
    changed: true,
    attachment: {
      ...attachment,
      ...(nextUrl ? { url: nextUrl } : {}),
      ...(nextOssKey ? { ossKey: nextOssKey } : {}),
    },
  };
}

async function main() {
  const deps = createAppContext();
  const apply = readFlag("--apply");
  const username = String(readArgValue("--username") || "").trim();
  const scopeFilter = String(readArgValue("--scope") || "").trim();
  const sessionFilter = String(readArgValue("--session") || "").trim();
  const { ChatState, AuthUser, UploadedFileContext } = deps;

  await deps.mongoose.connect(deps.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(
    `[chat-attachment-backfill] Mongo connected: ${deps.mongoUri} mode=${apply ? "apply" : "dry-run"}`,
  );

  try {
    let userFilter = {};
    if (username) {
      const user = await AuthUser.findOne({ username }, { _id: 1, username: 1 }).lean();
      if (!user?._id) {
        throw new Error(`未找到用户：${username}`);
      }
      userFilter = { userId: user._id };
    }

    const docs = await ChatState.find(userFilter).lean();
    const users = await AuthUser.find(
      docs.length > 0
        ? { _id: { $in: docs.map((doc) => doc.userId).filter(Boolean) } }
        : { _id: null },
      { username: 1, profile: 1 },
    ).lean();
    const userById = new Map(users.map((user) => [String(user._id), user]));

    const summary = {
      scannedDocs: docs.length,
      changedDocs: 0,
      changedScopes: 0,
      changedSessions: 0,
      changedMessages: 0,
      changedAttachments: 0,
      changes: [],
    };

    for (const doc of docs) {
      const userId = String(doc.userId || "").trim();
      const user = userById.get(userId) || {};
      const scopes = buildScopeList(doc, deps).filter(
        (scopeKey) => !scopeFilter || scopeKey === scopeFilter,
      );
      if (scopes.length === 0) continue;

      const scopeStates = scopes
        .map((scopeKey) => ({
          scopeKey,
          rawState: deps.readTeacherScopedChatStateRaw(doc, scopeKey),
        }))
        .filter((item) => item.rawState);

      const scopedSessionIds = Array.from(
        new Set(
          scopeStates.flatMap(({ rawState }) =>
            (Array.isArray(rawState?.sessions) ? rawState.sessions : [])
              .map((session) => String(session?.id || "").trim())
              .filter((sessionId) => !!sessionId && (!sessionFilter || sessionId === sessionFilter)),
          ),
        ),
      );
      if (scopedSessionIds.length === 0) continue;

      const uploadedContextDocs = await UploadedFileContext.find(
        {
          userId,
          sessionId: { $in: scopedSessionIds },
        },
        { sessionId: 1, messageId: 1, ossFiles: 1 },
      ).lean();
      const uploadedContextByKey = new Map(
        uploadedContextDocs.map((item) => [
          `${String(item?.sessionId || "").trim()}::${String(item?.messageId || "").trim()}`,
          deps.normalizeUploadedFileContextOssFiles(item?.ossFiles),
        ]),
      );

      const setPayload = {};
      const docChanges = [];

      for (const { scopeKey, rawState } of scopeStates) {
        const safeSessions = Array.isArray(rawState?.sessions) ? rawState.sessions : [];
        const sourceSessionMessages =
          rawState?.sessionMessages && typeof rawState.sessionMessages === "object"
            ? rawState.sessionMessages
            : {};

        let nextSessionMessages = sourceSessionMessages;
        let scopeChanged = false;
        const scopeChanges = [];

        for (const session of safeSessions) {
          const sessionId = String(session?.id || "").trim();
          if (!sessionId || (sessionFilter && sessionId !== sessionFilter)) continue;

          const list = Array.isArray(sourceSessionMessages[sessionId])
            ? sourceSessionMessages[sessionId]
            : [];
          if (list.length === 0) continue;

          let sessionChanged = false;
          const nextList = list.map((message) => {
            const messageId = String(message?.id || "").trim();
            const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
            if (!messageId || attachments.length === 0) return message;

            const ossFiles =
              uploadedContextByKey.get(`${sessionId}::${messageId}`) || [];
            if (ossFiles.length === 0) return message;

            let messageChanged = false;
            const nextAttachments = attachments.map((attachment, attachmentIndex) => {
              const matchedOssFile = matchAttachmentOssFile(
                deps,
                attachment,
                ossFiles,
                attachmentIndex,
              );
              if (!matchedOssFile) return attachment;
              const patched = patchAttachmentWithOss(deps, attachment, matchedOssFile);
              if (!patched.changed) return attachment;
              sessionChanged = true;
              messageChanged = true;
              summary.changedAttachments += 1;
              return patched.attachment;
            });

            if (!messageChanged) return message;
            summary.changedMessages += 1;
            scopeChanges.push({
              sessionId,
              messageId,
              attachmentCount: nextAttachments.length,
            });
            return {
              ...message,
              attachments: nextAttachments,
            };
          });

          if (!sessionChanged) continue;
          if (nextSessionMessages === sourceSessionMessages) {
            nextSessionMessages = { ...sourceSessionMessages };
          }
          nextSessionMessages[sessionId] = nextList;
          scopeChanged = true;
          summary.changedSessions += 1;
        }

        if (!scopeChanged) continue;
        setPayload[deps.getTeacherScopedChatStatePath("sessionMessages", scopeKey)] =
          nextSessionMessages;
        summary.changedScopes += 1;
        docChanges.push({
          scopeKey,
          messages: scopeChanges,
        });
      }

      if (docChanges.length === 0) continue;

      summary.changedDocs += 1;
      summary.changes.push({
        userId,
        username: user.username || "",
        displayName: user.profile?.name || "",
        scopes: docChanges,
      });

      if (apply) {
        await ChatState.findOneAndUpdate({ _id: doc._id }, { $set: setPayload });
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await deps.mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[chat-attachment-backfill] failed:", error);
  process.exitCode = 1;
});
