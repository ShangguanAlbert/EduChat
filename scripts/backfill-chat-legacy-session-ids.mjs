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

async function main() {
  const deps = createAppContext();
  const apply = readFlag("--apply");
  const username = String(readArgValue("--username") || "").trim();
  const scopeFilter = String(readArgValue("--scope") || "").trim();
  const ChatState = deps.ChatState;
  const AuthUser = deps.AuthUser;
  const SessionNotes = deps.mongoose.model("SessionNotes");
  const UploadedFileContext = deps.mongoose.model("UploadedFileContext");

  await deps.mongoose.connect(deps.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(
    `[chat-session-backfill] Mongo connected: ${deps.mongoUri} mode=${apply ? "apply" : "dry-run"}`,
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
      remappedSessions: 0,
      updatedSessionNotes: 0,
      updatedUploadedFileContexts: 0,
      ambiguousExternalRefs: [],
      changes: [],
    };

    for (const doc of docs) {
      const userId = String(doc.userId || "").trim();
      const user = userById.get(userId) || {};
      const scopes = buildScopeList(doc, deps).filter(
        (scopeKey) => !scopeFilter || scopeKey === scopeFilter,
      );
      if (scopes.length === 0) continue;

      const setPayload = { userId };
      const perScopeChanges = [];
      const externalCandidates = new Map();

      scopes.forEach((scopeKey, scopeIndex) => {
        const rawState = deps.readTeacherScopedChatStateRaw(doc, scopeKey);
        const migrated = deps.migrateLegacyChatStateSessionIds(rawState, {
          nowMs: Date.now() + scopeIndex * 1000,
        });
        if (!migrated.changed) return;

        const path = (field) => deps.getTeacherScopedChatStatePath(field, scopeKey);
        setPayload[path("activeId")] = migrated.state.activeId;
        setPayload[path("groups")] = migrated.state.groups;
        setPayload[path("sessions")] = migrated.state.sessions;
        setPayload[path("sessionMessages")] = migrated.state.sessionMessages;
        setPayload[path("sessionContextRefs")] = migrated.state.sessionContextRefs;
        setPayload[path("settings")] = migrated.state.settings;

        Object.entries(migrated.sessionIdMap).forEach(([oldSessionId, newSessionId]) => {
          const bucket = externalCandidates.get(oldSessionId) || [];
          bucket.push({ scopeKey, newSessionId });
          externalCandidates.set(oldSessionId, bucket);
        });

        perScopeChanges.push({
          scopeKey,
          activeId: migrated.state.activeId,
          sessionIdMap: migrated.sessionIdMap,
        });
      });

      if (perScopeChanges.length === 0) continue;

      summary.changedDocs += 1;
      summary.changedScopes += perScopeChanges.length;
      summary.remappedSessions += perScopeChanges.reduce(
        (total, item) => total + Object.keys(item.sessionIdMap).length,
        0,
      );
      summary.changes.push({
        userId,
        username: user.username || "",
        displayName: user.profile?.name || "",
        scopes: perScopeChanges,
      });

      if (apply) {
        await ChatState.findOneAndUpdate({ _id: doc._id }, { $set: setPayload });

        for (const [oldSessionId, targets] of externalCandidates.entries()) {
          const uniqueTargets = Array.from(
            new Set(targets.map((target) => String(target.newSessionId || "").trim())),
          ).filter(Boolean);
          if (uniqueTargets.length !== 1) {
            summary.ambiguousExternalRefs.push({
              userId,
              username: user.username || "",
              oldSessionId,
              targets,
            });
            continue;
          }

          const nextSessionId = uniqueTargets[0];
          const [notesResult, filesResult] = await Promise.all([
            SessionNotes.updateMany(
              { userId, sessionId: oldSessionId },
              { $set: { sessionId: nextSessionId } },
            ),
            UploadedFileContext.updateMany(
              { userId, sessionId: oldSessionId },
              { $set: { sessionId: nextSessionId } },
            ),
          ]);
          summary.updatedSessionNotes += Number(notesResult.modifiedCount || 0);
          summary.updatedUploadedFileContexts += Number(filesResult.modifiedCount || 0);
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await deps.mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[chat-session-backfill] failed:", error);
  process.exitCode = 1;
});
