import { normalizeChatBootstrapResponse } from "../../shared/contracts/chat.js";
import {
  getClassroomFileFallbackName,
  getClassroomFileLabel,
  resolveClassroomFileKindByTask,
} from "../../shared/classroomFileLabels.js";
import {
  CLASSROOM_HOMEWORK_DIRECTORY_UPLOAD_ERROR,
  normalizeClassroomHomeworkRequirementText,
} from "../../shared/classroomHomework.js";
import { normalizeFinalTestContentConfig } from "../../shared/finalTestContent.js";
import {
  applyFinalTestPatch,
  buildFinalTestRiskSnapshot,
  createFinalTestSessionBase,
  FINAL_TEST_DURATION_MINUTES,
  lockExpiredSession,
  normalizeFinalTestSession,
  resolveFinalTestVariant,
} from "../../shared/finalTestState.js";
import { sanitizeGroupChatAiConfig } from "../services/group-chat-ai-config.js";
import { createAuthRateLimiter } from "../modules/auth/rate-limit.js";

export function registerAuthUserClassroomRoutes(app, deps) {
  function readSignedUrlExpiryText(url) {
    const safeUrl = String(url || "").trim();
    if (!safeUrl) return "";
    try {
      const parsed = new URL(safeUrl);
      const epochText =
        parsed.searchParams.get("Expires") ||
        parsed.searchParams.get("x-oss-expires") ||
        "";
      const epoch = Number(epochText);
      if (!Number.isFinite(epoch) || epoch <= 0) return "";
      return new Date(epoch * 1000).toISOString();
    } catch {
      return "";
    }
  }

  const {
    express,
    cors,
    env = process.env,
    XLSX,
    PDFParse,
    OSS,
    WebSocketServer,
    SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT,
    PROMPT_LEAK_PROBE_KEYWORDS,
    ALIYUN_SEARCH_CITATION_FORMATS,
    ALIYUN_SEARCH_FRESHNESS_OPTIONS,
    ALIYUN_SEARCH_STRATEGIES,
    DEFAULT_TEACHER_SCOPE_KEY,
    SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
    SHI_GAOJUN_TEACHER_SCOPE_KEY,
    YANG_JUNFENG_TEACHER_SCOPE_KEY,
    getTeacherScopeLabel,
    isDefaultTeacherScopeKey,
    sanitizeTeacherScopeKey,
    PAIR_PROGRAMMING_INVITE_CODE,
    TEACHER_REGISTRATION_INVITE_CODE,
    SELF_REGISTERED_TEACHER_ACCOUNT_TAG,
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_STATUS_PENDING_BINDING,
    ACCOUNT_STATUS_DISABLED,
    isPairProgrammingInviteCodeValid,
    isPairProgrammingTeacherScope,
    FIXED_STUDENT_ACCOUNTS,
    FIXED_STUDENT_ACCOUNT_TAG,
    FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
    MAX_FILE_SIZE_BYTES,
    MAX_FILES,
    CHAT_PREPARED_ATTACHMENT_CACHE_TTL_MS,
    CHAT_PREPARED_ATTACHMENT_CACHE_MAX_ITEMS,
    CHAT_PREPARED_ATTACHMENT_MAX_REFS,
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
    TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
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
    STUDENT_HOMEWORK_MAX_FILE_SIZE_BYTES,
    STUDENT_HOMEWORK_UPLOAD_MAX_FILES,
    STUDENT_HOMEWORK_MAX_FILES_PER_LESSON_PER_STUDENT,
    FIXED_ADMIN_ACCOUNTS,
    FIXED_ADMIN_USERNAME_KEYS,
    FIXED_STUDENT_USERNAME_KEYS,
    RESERVED_ADMIN_USERNAME_KEYS,
    CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE,
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
    studentHomeworkUpload,
    teacherClassroomFileUpload,
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
    FinalTestSession,
    normalizeUploadedFileContextOssFiles,
    clearSessionContextRef,
    normalizeMultipartUploadFile,
    readAdminAgentConfig,
    sanitizeAdminClassroomCourseFilesPayload,
    sortAdminClassroomCoursePlans,
    sanitizeAdminClassroomCoursePlansPayload,
    sanitizeAdminClassroomDisciplineConfigPayload,
    sanitizeAdminClassroomSeatLayoutPayload,
    sanitizeAdminClassroomSeatLayoutsByClassPayload,
    createAdminClassroomLessonFileId,
    createClassroomHomeworkFileId,
    normalizeAdminClassroomLessonFileDoc,
    normalizeClassroomHomeworkFileDoc,
    compareClassroomRosterStudent,
    collectAdminClassroomFileIdsFromLesson,
    findAdminClassroomLessonTaskById,
    findAdminClassroomLessonByFileId,
    normalizeAdminConfigDoc,
    sanitizeAgentPromptPayload,
    sanitizeAgentRuntimeConfigsPayload,
    resolveAgentRuntimeConfigs,
    sanitizeRuntimeInteger,
    sanitizeRuntimeBoolean,
    buildAdminAgentSettingsResponse,
    buildAgentProviderDefaults,
    markUserOnlinePresence,
    markUserOnlineBrowserHeartbeat,
    requireChatAuth,
    requireAdminAuth,
    readJsonLikeField,
    defaultChatState,
    readTeacherScopedChatStateRaw,
    normalizeChatStateDoc,
    getTeacherScopedChatStatePath,
    migrateLegacyChatStateSessionIds,
    sanitizeChatStatePayload,
    sanitizeChatStateMetaPayload,
    mergeSanitizedChatMessageLists,
    sanitizeSessionMessageUpsertsPayload,
    sanitizeStateSettings,
    resolveActiveId,
    sanitizeUserProfile,
    validateUserProfile,
    isUserProfileComplete,
    sanitizeId,
    sanitizeText,
    sanitizeIsoDate,
    sanitizeGroupChatFileName,
    buildAttachmentContentDisposition,
    sanitizeGroupChatFileMimeType,
    sanitizeAliyunOssBucket,
    sanitizeAliyunOssRegion,
    sanitizeGroupChatFileStorageType,
    sanitizeGroupChatOssObjectKey,
    sanitizeGroupChatHttpUrl,
    uploadTeacherLessonFileToOss,
    uploadStudentHomeworkFileToOss,
    buildGroupChatOssObjectUrl,
    buildGroupChatFileSignedDownloadUrl,
    buildTeacherLessonFileDownloadUrl,
    deleteGroupChatOssObject,
    normalizeUsername,
    toUsernameKey,
    isReservedAdminUsernameKey,
    isTeacherAdminUser,
    readAccountStatus,
    resolveLoginLockedTeacherScopeKey,
    validatePassword,
    hashPassword,
    verifyPassword,
    signToken,
    authenticateAdminRequest,
    formatDisplayTime,
    formatFileStamp,
    buildZipBuffer,
    sanitizeZipEntryName,
    toPublicUser,
  } = deps;

  function readConfiguredPassphrase(name) {
    return String(env?.[name] || "").trim();
  }

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const loginRateLimiter = createAuthRateLimiter({
    windowMs: 10 * 60 * 1000,
    maxAttempts: 20,
    errorMessage: "登录尝试次数过多，请 10 分钟后再试。",
  });
  const registrationRateLimiter = createAuthRateLimiter({
    windowMs: 30 * 60 * 1000,
    maxAttempts: 8,
    errorMessage: "注册尝试次数过多，请 30 分钟后再试。",
  });

  const CLASSROOM_TARGET_CLASS_NAMES = Object.freeze(["810班", "811班"]);
  const CLASSROOM_DEFAULT_TARGET_CLASS_NAME = CLASSROOM_TARGET_CLASS_NAMES[0];

  function normalizeFinalTestUsernameKey(value) {
    if (typeof toUsernameKey === "function") {
      return toUsernameKey(value);
    }
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  const TERMINAL_ADMIN_USERNAME_KEY = normalizeFinalTestUsernameKey("上官福泽");

  function sanitizeClassroomTargetClassName(value, fallback = CLASSROOM_DEFAULT_TARGET_CLASS_NAME) {
    const className = sanitizeText(value, "", 40).replace(/\s+/g, "");
    if (className) return className;
    return sanitizeText(fallback, CLASSROOM_DEFAULT_TARGET_CLASS_NAME, 40).replace(/\s+/g, "");
  }

  function sanitizeClassroomUserClassName(value) {
    return sanitizeText(value, "", 40).replace(/\s+/g, "");
  }

  async function readAuthorizedClassNamesForTeacherScope(
    teacherScopeKey = SHI_GAOJUN_TEACHER_SCOPE_KEY,
  ) {
    const users = await AuthUser.find(
      {
        role: "user",
        lockedTeacherScopeKey: sanitizeTeacherScopeKey(teacherScopeKey),
      },
      { profile: 1 },
    ).lean();
    return Array.from(
      new Set(
        (Array.isArray(users) ? users : [])
          .map((user) =>
            sanitizeClassroomUserClassName(
              sanitizeUserProfile(user?.profile).className,
            ),
          )
          .filter(Boolean),
      ),
    ).sort((a, b) =>
      a.localeCompare(b, "zh-CN", { numeric: true, sensitivity: "base" }),
    );
  }

  function resolveClassroomLessonClassName(lesson) {
    return sanitizeClassroomTargetClassName(lesson?.className);
  }

  function sanitizeSeatLayoutClassName(value) {
    return sanitizeText(value, "", 40).replace(/\s+/g, "");
  }

  function normalizeSeatLayoutsByClassFromConfig(config) {
    return sanitizeAdminClassroomSeatLayoutsByClassPayload(config?.seatLayoutsByClass);
  }

  function normalizeSeatValueToken(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function buildStudentSeatIdentity(user, profile) {
    const safeProfile = profile && typeof profile === "object" ? profile : {};
    const username = sanitizeText(user?.username, "", 80);
    const studentName = sanitizeText(safeProfile.name || username, "", 64);
    const studentId = sanitizeText(safeProfile.studentId, "", 20);
    const displayValue = `${studentName || username || "未命名学生"}${
      studentId ? `（${studentId}）` : ""
    }`;
    const tokenSet = new Set(
      [
        normalizeSeatValueToken(displayValue),
        normalizeSeatValueToken(studentName),
        normalizeSeatValueToken(username),
        normalizeSeatValueToken(studentId),
        normalizeSeatValueToken(
          studentId ? `${studentName || username || ""}(${studentId})` : "",
        ),
        normalizeSeatValueToken(
          studentId ? `${studentName || username || ""}（${studentId}）` : "",
        ),
      ].filter(Boolean),
    );
    return {
      username,
      studentName,
      studentId,
      displayValue,
      tokenSet,
    };
  }

  function isFinalTestDemoUser(user) {
    if (!user || user.role !== "admin") return false;
    return normalizeFinalTestUsernameKey(user?.username) === TERMINAL_ADMIN_USERNAME_KEY;
  }

  function resolveExperimentTaskDescriptor(teacherScopeKey, className, user) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(teacherScopeKey);
    const safeClassName = sanitizeClassroomUserClassName(className);
    const demoMode =
      safeTeacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY && isFinalTestDemoUser(user);
    const variant = demoMode
      ? "three-stage-guided"
      : safeTeacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY
        ? resolveFinalTestVariant(safeClassName)
        : "disabled";
    const timingEnabled = variant !== "disabled" && !demoMode;
    return {
      enabled: variant !== "disabled",
      variant,
      durationMinutes: timingEnabled ? FINAL_TEST_DURATION_MINUTES : 0,
      entryLabel: "期末测试",
      demoMode,
      timingEnabled,
    };
  }

  function isFinalTestDebugRequest(req) {
    const queryValue = String(req?.query?.finalTestDebug || req?.query?.debug || "")
      .trim()
      .toLowerCase();
    const bodyValue = String(req?.body?.finalTestDebug || req?.body?.debug || "")
      .trim()
      .toLowerCase();
    return ["1", "true", "yes", "on"].includes(queryValue) || ["1", "true", "yes", "on"].includes(bodyValue);
  }

  async function resolveMaybeLean(docOrQuery) {
    const resolved = await docOrQuery;
    if (resolved && typeof resolved.lean === "function") {
      return resolved.lean();
    }
    return resolved;
  }

  async function loadClassroomRosterDirectory(teacherScopeKey) {
    const rosterQuery = AuthUser.find(
      {
        role: "user",
        lockedTeacherScopeKey: teacherScopeKey,
      },
      { username: 1, profile: 1, accountTag: 1 },
    );
    const rosterUsers =
      rosterQuery && typeof rosterQuery.lean === "function"
        ? await rosterQuery.lean()
        : await resolveMaybeLean(rosterQuery);

    const rosterAll = (Array.isArray(rosterUsers) ? rosterUsers : [])
      .map((user) => {
        const profile = sanitizeUserProfile(user?.profile);
        const className = sanitizeClassroomUserClassName(profile.className);
        return {
          userId: sanitizeId(user?._id, ""),
          username: sanitizeText(user?.username, "", 64),
          studentName: sanitizeText(profile.name || user?.username, "", 64),
          studentId: sanitizeText(profile.studentId, "", 20),
          className,
        };
      })
      .filter((item) => item.userId)
      .sort(compareClassroomRosterStudent);

    const userClassByUserId = new Map(
      rosterAll.map((student) => [student.userId, student.className]),
    );
    const rosterByClassName = new Map(
      CLASSROOM_TARGET_CLASS_NAMES.map((className) => [className, []]),
    );
    rosterAll.forEach((student) => {
      const className = sanitizeClassroomUserClassName(student.className);
      if (!className) return;
      if (!rosterByClassName.has(className)) {
        rosterByClassName.set(className, []);
      }
      rosterByClassName.get(className).push(student);
    });

    return {
      rosterAll,
      rosterByClassName,
      userClassByUserId,
    };
  }

  async function loadFixedFinalTestRosterDirectory(teacherScopeKey) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(teacherScopeKey);
    const fixedAccounts = (Array.isArray(FIXED_STUDENT_ACCOUNTS)
      ? FIXED_STUDENT_ACCOUNTS
      : [])
      .map((account) => {
        const username = sanitizeText(account?.username, "", 64);
        const usernameKey = normalizeFinalTestUsernameKey(username);
        const className = sanitizeClassroomUserClassName(account?.className);
        const requiredTeacherScopeKey = sanitizeTeacherScopeKey(
          account?.requiredTeacherScopeKey ||
            FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
        );
        if (
          !username ||
          !usernameKey ||
          !className ||
          requiredTeacherScopeKey !== safeTeacherScopeKey
        ) {
          return null;
        }
        return {
          username,
          usernameKey,
          studentName: username,
          studentId: sanitizeText(account?.studentId, "", 20),
          className,
        };
      })
      .filter(Boolean);
    const usernameKeys = fixedAccounts.map((account) => account.usernameKey);
    const fixedUserQuery =
      usernameKeys.length > 0
        ? AuthUser.find(
            {
              usernameKey: { $in: usernameKeys },
            },
            { username: 1, usernameKey: 1, profile: 1, accountTag: 1 },
          )
        : null;
    const fixedUsers = fixedUserQuery
      ? fixedUserQuery && typeof fixedUserQuery.lean === "function"
        ? await fixedUserQuery.lean()
        : await resolveMaybeLean(fixedUserQuery)
      : [];
    const userByUsernameKey = new Map(
      (Array.isArray(fixedUsers) ? fixedUsers : []).map((user) => [
        normalizeFinalTestUsernameKey(user?.usernameKey || user?.username),
        user,
      ]),
    );
    const rosterAll = fixedAccounts
      .map((account) => {
        const user = userByUsernameKey.get(account.usernameKey) || null;
        const profile = sanitizeUserProfile(user?.profile);
        return {
          userId: sanitizeId(user?._id, "") || `fixed:${account.usernameKey}`,
          username: account.username,
          studentName:
            sanitizeText(profile.name, "", 64) ||
            account.studentName ||
            account.username,
          studentId:
            sanitizeText(profile.studentId, "", 20) || account.studentId,
          className: account.className,
          usernameKey: account.usernameKey,
          matchedUserId: sanitizeId(user?._id, ""),
        };
      })
      .sort(compareClassroomRosterStudent);
    const rosterByClassName = new Map(
      CLASSROOM_TARGET_CLASS_NAMES.map((className) => [className, []]),
    );
    rosterAll.forEach((student) => {
      if (!rosterByClassName.has(student.className)) {
        rosterByClassName.set(student.className, []);
      }
      rosterByClassName.get(student.className).push(student);
    });
    return {
      rosterAll,
      rosterByClassName,
    };
  }

  function buildFinalTestSessionQuery({ teacherScopeKey, studentUserId, className }) {
    return {
      key: ADMIN_CONFIG_KEY,
      teacherScopeKey: sanitizeTeacherScopeKey(teacherScopeKey),
      studentUserId: sanitizeId(studentUserId, ""),
      className: sanitizeClassroomUserClassName(className),
    };
  }

  function buildPersistedFinalTestSessionDoc(query, session) {
    const normalized = normalizeFinalTestSession(session);
    return {
      key: ADMIN_CONFIG_KEY,
      teacherScopeKey: query.teacherScopeKey,
      studentUserId: query.studentUserId,
      className: query.className,
      variant: normalized.variant,
      status: normalized.status,
      startedAt: normalized.startedAt,
      deadlineAt: normalized.deadlineAt,
      lockedAt: normalized.lockedAt,
      submittedAt: normalized.submittedAt,
      timeExpired: normalized.timeExpired === true,
      durationMinutes: normalized.durationMinutes,
      payload: {
        stage1: normalized.stage1,
        stage2: normalized.stage2,
        stage3: normalized.stage3,
        postSubmit: normalized.postSubmit,
        processLog: normalized.processLog,
        turnbackEvents: normalized.turnbackEvents,
        riskLog: normalized.riskLog,
      },
    };
  }

  async function writeFinalTestSession(query, session) {
    const payload = buildPersistedFinalTestSessionDoc(query, session);
    const updated = await resolveMaybeLean(
      FinalTestSession.findOneAndUpdate(
        query,
        {
          $set: payload,
        },
        {
          upsert: true,
          new: true,
        },
      ),
    );
    return normalizeFinalTestSession(updated);
  }

  async function readFinalTestSessionRecord({
    teacherScopeKey,
    studentUserId,
    className,
    authUser,
    debugMode = false,
  }) {
    const query = buildFinalTestSessionQuery({
      teacherScopeKey,
      studentUserId,
      className,
    });
    const experimentTask = resolveExperimentTaskDescriptor(
      teacherScopeKey,
      className,
      authUser,
    );
    const existing = await resolveMaybeLean(FinalTestSession.findOne(query));
    if (!existing) {
      return {
        query,
        session: normalizeFinalTestSession({
          ...createFinalTestSessionBase({
            studentUserId,
            className,
            variant: experimentTask.variant,
            nowIso: new Date().toISOString(),
            durationMinutes: experimentTask.durationMinutes,
          }),
          status: "not_started",
          startedAt: "",
          deadlineAt: "",
          durationMinutes: experimentTask.durationMinutes,
        }),
        experimentTask,
      };
    }
    const normalized = normalizeFinalTestSession(existing);
    const nowIso = new Date(Date.now()).toISOString();
    const baseSession = normalizeFinalTestSession({
      ...normalized,
      durationMinutes: experimentTask.durationMinutes,
      deadlineAt: experimentTask.timingEnabled ? normalized.deadlineAt : "",
    });
    const nextSession =
      debugMode || !experimentTask.timingEnabled ? baseSession : lockExpiredSession(baseSession, nowIso);
    if (
      nextSession.status !== normalized.status ||
      nextSession.timeExpired !== normalized.timeExpired ||
      nextSession.lockedAt !== normalized.lockedAt ||
      nextSession.durationMinutes !== normalized.durationMinutes ||
      nextSession.deadlineAt !== normalized.deadlineAt
    ) {
      const persisted = await writeFinalTestSession(query, nextSession);
      return { query, session: persisted, experimentTask };
    }
    return { query, session: nextSession, experimentTask };
  }

  function findSeatIndexByIdentityTokens(seats, tokenSet) {
    if (!Array.isArray(seats) || !(tokenSet instanceof Set) || tokenSet.size === 0) return -1;
    return seats.findIndex((seatValue) => tokenSet.has(normalizeSeatValueToken(seatValue)));
  }

  function buildSeatLayoutResponseForUser(layoutsByClass, className, user, profile) {
    const safeClassName = sanitizeSeatLayoutClassName(className);
    if (!safeClassName) return null;
    const safeLayouts = sanitizeAdminClassroomSeatLayoutsByClassPayload(layoutsByClass);
    const layout = sanitizeAdminClassroomSeatLayoutPayload(safeLayouts[safeClassName] || null);
    const identity = buildStudentSeatIdentity(user, profile);
    const mySeatIndex = findSeatIndexByIdentityTokens(layout.seats, identity.tokenSet);
    return {
      className: safeClassName,
      rows: layout.rows,
      columns: layout.columns,
      seats: layout.seats,
      studentFillEnabled: !!layout.studentFillEnabled,
      teacherLocked: !!layout.teacherLocked,
      mySeatIndex,
      mySeatValue: mySeatIndex >= 0 ? String(layout.seats[mySeatIndex] || "").trim() : "",
      myDisplayValue: identity.displayValue,
      updatedAt: layout.updatedAt || "",
    };
  }

  app.get("/api/health", (_, res) => {
    res.json({ ok: true });
  });

  app.get("/api/auth/status", async (_req, res) => {
    const [totalUsers, totalTeachers] = await Promise.all([
      AuthUser.countDocuments({ role: "user" }),
      AuthUser.countDocuments({
        role: "admin",
        accountStatus: { $ne: ACCOUNT_STATUS_DISABLED },
      }),
    ]);

    res.json({
      ok: true,
      hasAnyUser: totalUsers > 0,
      hasAdmin: totalTeachers > 0 || FIXED_ADMIN_ACCOUNTS.length > 0,
      teacherRegistrationEnabled: !!TEACHER_REGISTRATION_INVITE_CODE,
      adminUsernames: FIXED_ADMIN_ACCOUNTS.map((item) => item.username),
      preloadedStudentCount: FIXED_STUDENT_ACCOUNTS.length,
      preloadedStudentTeacherScopeKey: FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
      preloadedStudentTeacherScopeLabel: getTeacherScopeLabel(
        FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
      ),
    });
  });

  function buildInitialPersistedChatState() {
    return sanitizeChatStatePayload(defaultChatState());
  }

  async function ensureBootstrapChatState(stateDoc, userId, teacherScopeKey) {
    const rawState = readTeacherScopedChatStateRaw(stateDoc, teacherScopeKey);
    if (!rawState) {
      const initialState = buildInitialPersistedChatState();
      const setPayload = { userId };
      setPayload[getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
        initialState.activeId;
      setPayload[getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
        initialState.groups;
      setPayload[getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
        initialState.sessions;
      setPayload[getTeacherScopedChatStatePath("sessionMessages", teacherScopeKey)] =
        initialState.sessionMessages;
      setPayload[getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
        initialState.settings;

      await ChatState.findOneAndUpdate(
        { userId },
        { $set: setPayload },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: isDefaultTeacherScopeKey(teacherScopeKey),
        },
      );
      return initialState;
    }

    const migrated = migrateLegacyChatStateSessionIds(rawState);
    if (!migrated.changed) {
      return normalizeChatStateDoc(stateDoc, teacherScopeKey);
    }

    const setPayload = { userId };
    setPayload[getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      migrated.state.activeId;
    setPayload[getTeacherScopedChatStatePath("groups", teacherScopeKey)] =
      migrated.state.groups;
    setPayload[getTeacherScopedChatStatePath("sessions", teacherScopeKey)] =
      migrated.state.sessions;
    setPayload[getTeacherScopedChatStatePath("sessionMessages", teacherScopeKey)] =
      migrated.state.sessionMessages;
    setPayload[getTeacherScopedChatStatePath("sessionContextRefs", teacherScopeKey)] =
      migrated.state.sessionContextRefs;
    setPayload[getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      migrated.state.settings;

    await ChatState.findOneAndUpdate(
      { userId },
      { $set: setPayload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: isDefaultTeacherScopeKey(teacherScopeKey),
      },
    );

    return sanitizeChatStatePayload(migrated.state);
  }

  function resolveChatAttachmentLinkFromOssFiles(attachment, attachmentIndex, ossFiles = []) {
    const safeOssFiles = normalizeUploadedFileContextOssFiles(ossFiles);
    if (safeOssFiles.length === 0) return null;

    const attachmentName = sanitizeGroupChatFileName(attachment?.name);
    const attachmentMimeType = sanitizeGroupChatFileMimeType(attachment?.type);
    const attachmentSize = sanitizeRuntimeInteger(
      attachment?.size,
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const matchedByMeta =
      safeOssFiles.find((item) => {
        const sameName =
          sanitizeGroupChatFileName(item?.fileName) === attachmentName &&
          !!attachmentName;
        const sameMime =
          sanitizeGroupChatFileMimeType(item?.mimeType) === attachmentMimeType &&
          !!attachmentMimeType;
        const sameSize =
          sanitizeRuntimeInteger(item?.size, 0, 0, Number.MAX_SAFE_INTEGER) ===
            attachmentSize && attachmentSize > 0;
        return sameName || (sameMime && sameSize);
      }) || null;
    const matchedByIndex =
      !matchedByMeta &&
      attachmentIndex >= 0 &&
      attachmentIndex < safeOssFiles.length
        ? safeOssFiles[attachmentIndex]
        : null;
    const matched = matchedByMeta || matchedByIndex;
    if (!matched) return null;

    const ossKey = sanitizeGroupChatOssObjectKey(matched?.ossKey);
    const url = sanitizeGroupChatHttpUrl(matched?.fileUrl);
    if (!ossKey && !url) return null;
    return { ossKey, url };
  }

  function enrichChatMessageAttachmentsFromOssFiles(message, ossFiles = []) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    if (attachments.length === 0) {
      return { message, changed: false };
    }

    let changed = false;
    const nextAttachments = attachments.map((attachment, attachmentIndex) => {
      const currentUrl = sanitizeGroupChatHttpUrl(attachment?.url || attachment?.fileUrl);
      const currentOssKey = sanitizeGroupChatOssObjectKey(attachment?.ossKey);
      if (currentUrl && currentOssKey) return attachment;

      const resolved = resolveChatAttachmentLinkFromOssFiles(
        attachment,
        attachmentIndex,
        ossFiles,
      );
      if (!resolved) return attachment;

      const nextUrl = currentUrl || resolved.url;
      const nextOssKey = currentOssKey || resolved.ossKey;
      if (nextUrl === currentUrl && nextOssKey === currentOssKey) {
        return attachment;
      }

      changed = true;
      return {
        ...attachment,
        ...(nextUrl ? { url: nextUrl } : {}),
        ...(nextOssKey ? { ossKey: nextOssKey } : {}),
      };
    });

    if (!changed) {
      return { message, changed: false };
    }

    return {
      message: {
        ...message,
        attachments: nextAttachments,
      },
      changed: true,
    };
  }

  async function hydrateChatStateAttachmentLinks(sessionMessages, userId) {
    const safeSessionMessages =
      sessionMessages && typeof sessionMessages === "object" ? sessionMessages : {};
    const refs = [];

    Object.entries(safeSessionMessages).forEach(([rawSessionId, rawMessages]) => {
      const sessionId = sanitizeId(rawSessionId, "");
      const messages = Array.isArray(rawMessages) ? rawMessages : [];
      if (!sessionId || messages.length === 0) return;
      messages.forEach((message) => {
        const messageId = sanitizeId(message?.id, "");
        const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
        const needsHydrate = attachments.some((attachment) => {
          const hasUrl = !!sanitizeGroupChatHttpUrl(attachment?.url || attachment?.fileUrl);
          const hasOssKey = !!sanitizeGroupChatOssObjectKey(attachment?.ossKey);
          return !hasUrl || !hasOssKey;
        });
        if (!messageId || !needsHydrate) return;
        refs.push({ sessionId, messageId });
      });
    });

    if (refs.length === 0) {
      return { sessionMessages: safeSessionMessages, changed: false };
    }

    const docs = await UploadedFileContext.find({
      userId: String(userId || "").trim(),
      sessionId: { $in: Array.from(new Set(refs.map((item) => item.sessionId))) },
      messageId: { $in: Array.from(new Set(refs.map((item) => item.messageId))) },
    })
      .select({ sessionId: 1, messageId: 1, ossFiles: 1 })
      .lean();

    if (!Array.isArray(docs) || docs.length === 0) {
      return { sessionMessages: safeSessionMessages, changed: false };
    }

    const ossFilesByMessageKey = new Map();
    docs.forEach((doc) => {
      const sessionId = sanitizeId(doc?.sessionId, "");
      const messageId = sanitizeId(doc?.messageId, "");
      if (!sessionId || !messageId) return;
      ossFilesByMessageKey.set(
        `${sessionId}::${messageId}`,
        normalizeUploadedFileContextOssFiles(doc?.ossFiles),
      );
    });

    let changed = false;
    const nextSessionMessages = {};
    Object.entries(safeSessionMessages).forEach(([rawSessionId, rawMessages]) => {
      const sessionId = sanitizeId(rawSessionId, "");
      const messages = Array.isArray(rawMessages) ? rawMessages : [];
      nextSessionMessages[rawSessionId] = messages.map((message) => {
        const messageId = sanitizeId(message?.id, "");
        const ossFiles = ossFilesByMessageKey.get(`${sessionId}::${messageId}`) || [];
        if (ossFiles.length === 0) return message;
        const enriched = enrichChatMessageAttachmentsFromOssFiles(message, ossFiles);
        if (enriched.changed) changed = true;
        return enriched.message;
      });
    });

    return {
      sessionMessages: changed ? nextSessionMessages : safeSessionMessages,
      changed,
    };
  }

  app.get("/api/chat/bootstrap", requireChatAuth, async (req, res) => {
    const user = req.authUser;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    const [stateDoc, adminConfig] = await Promise.all([
      ChatState.findOne({ userId: user._id }).lean(),
      readAdminAgentConfig(),
    ]);

    const normalizedProfile = sanitizeUserProfile(user.profile);
    const profileComplete = isUserProfileComplete(normalizedProfile);
    const state = await ensureBootstrapChatState(
      stateDoc,
      String(user._id || ""),
      teacherScopeKey,
    );
    const hydratedState = await hydrateChatStateAttachmentLinks(
      state.sessionMessages,
      String(user._id || ""),
    );
    if (hydratedState.changed) {
      state.sessionMessages = hydratedState.sessionMessages;
      const setPayload = { userId: req.authUser._id };
      setPayload[getTeacherScopedChatStatePath("sessionMessages", teacherScopeKey)] =
        hydratedState.sessionMessages;
      await ChatState.findOneAndUpdate(
        { userId: req.authUser._id },
        { $set: setPayload },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: isDefaultTeacherScopeKey(teacherScopeKey),
        },
      );
    }

    res.json(normalizeChatBootstrapResponse({
      ok: true,
      user: toPublicUser(user),
      teacherScopeKey,
      teacherScopeLabel: getTeacherScopeLabel(teacherScopeKey),
      profile: normalizedProfile,
      profileComplete,
      state,
      agentRuntimeConfigs: resolveAgentRuntimeConfigs(adminConfig.runtimeConfigs),
      agentProviderDefaults: buildAgentProviderDefaults(),
    }));
  });

  app.post("/api/chat/debug-log", requireChatAuth, async (req, res) => {
    const event = String(req.body?.event || "").trim().slice(0, 120);
    if (event !== "route_status") {
      res.json({ ok: true });
      return;
    }

    const payload =
      req.body?.payload && typeof req.body.payload === "object"
        ? req.body.payload
        : {};
    const username = String(req.authUser?.username || "").trim() || "-";
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    const timestamp = new Date().toISOString();
    const pathname = String(payload.pathname || "").trim() || "-";
    const ok = !!payload.ok;

    console.log(
      `[chat-route] ${timestamp} user=${username} teacherScope=${teacherScopeKey} pathname=${pathname} ok=${ok}`
    );

    res.json({ ok: true });
  });

  app.get("/api/classroom/tasks/settings", requireChatAuth, async (req, res) => {
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    const isShangguanTeacher = teacherScopeKey === SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;
    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const userClassName = sanitizeClassroomUserClassName(userProfile.className);
    const experimentTask = resolveExperimentTaskDescriptor(
      teacherScopeKey,
      userProfile.className,
      req.authUser,
    );
    const seatLayoutClassName = sanitizeSeatLayoutClassName(userProfile.className);
    let productImprovementEnabled = false;
    let teacherCoursePlans = [];
    let teacherHistoryCoursePlans = [];
    let seatLayout = null;
    let finalTestConfig = normalizeFinalTestContentConfig(null);

    if (isShangguanTeacher) {
      const config = await readAdminAgentConfig();
      productImprovementEnabled = !!config.shangguanClassTaskProductImprovementEnabled;
      finalTestConfig = normalizeFinalTestContentConfig(config.finalTestConfig);
      teacherHistoryCoursePlans = sortAdminClassroomCoursePlans(
        config.teacherCoursePlans
          .map((lesson) => ({
            ...lesson,
            className: resolveClassroomLessonClassName(lesson),
          }))
          .filter(
            (lesson) =>
              !userClassName ||
              resolveClassroomLessonClassName(lesson) === userClassName,
          ),
      );
      teacherCoursePlans = sortAdminClassroomCoursePlans(
        config.teacherCoursePlans
          .filter((lesson) => sanitizeRuntimeBoolean(lesson?.enabled, true))
          .map((lesson) => ({
            ...lesson,
            className: resolveClassroomLessonClassName(lesson),
          }))
          .filter(
            (lesson) =>
              !userClassName ||
              resolveClassroomLessonClassName(lesson) === userClassName,
          ),
      );
      seatLayout = buildSeatLayoutResponseForUser(
        normalizeSeatLayoutsByClassFromConfig(config),
        seatLayoutClassName,
        req.authUser,
        userProfile,
      );
    }

    res.json({
      ok: true,
      teacherScopeKey,
      teacherScopeLabel: getTeacherScopeLabel(teacherScopeKey),
      classroomTaskEnabled: isShangguanTeacher,
      firstLessonDate: CLASSROOM_FIRST_LESSON_DATE,
      questionnaireUrl: CLASSROOM_QUESTIONNAIRE_URL,
      productImprovementEnabled,
      experimentTask,
      finalTestConfig,
      teacherCoursePlans,
      teacherHistoryCoursePlans,
      seatLayout,
    });
  });

  app.get("/api/classroom/final-test/session", requireChatAuth, async (req, res) => {
    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const debugMode = isFinalTestDebugRequest(req);
    const { session, experimentTask } = await readFinalTestSessionRecord({
      teacherScopeKey: req.authTeacherScopeKey,
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      authUser: req.authUser,
      debugMode,
    });

    res.json({
      ok: true,
      experimentTask,
      session,
    });
  });

  app.post("/api/classroom/final-test/session/start", requireChatAuth, async (req, res) => {
    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const debugMode = isFinalTestDebugRequest(req);
    const { query, session, experimentTask } = await readFinalTestSessionRecord({
      teacherScopeKey: req.authTeacherScopeKey,
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      authUser: req.authUser,
      debugMode,
    });
    if (!experimentTask.enabled) {
      res.status(403).json({ error: "当前班级未开放期末测试。" });
      return;
    }
    if (session.status !== "not_started") {
      res.json({
        ok: true,
        experimentTask,
        session: {
          ...session,
          durationMinutes: experimentTask.durationMinutes,
        },
      });
      return;
    }
    const nowIso = new Date().toISOString();
    const started = createFinalTestSessionBase({
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      variant: experimentTask.variant,
      startedAt: nowIso,
      nowIso,
      durationMinutes: experimentTask.durationMinutes,
    });
    const persisted = await writeFinalTestSession(query, started);
    res.json({
      ok: true,
      experimentTask,
      session: {
        ...persisted,
        durationMinutes: experimentTask.durationMinutes,
      },
    });
  });

  app.put("/api/classroom/final-test/session", requireChatAuth, async (req, res) => {
    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const debugMode = isFinalTestDebugRequest(req);
    const { query, session, experimentTask } = await readFinalTestSessionRecord({
      teacherScopeKey: req.authTeacherScopeKey,
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      authUser: req.authUser,
      debugMode,
    });
    if (!experimentTask.enabled) {
      res.status(403).json({ error: "当前班级未开放期末测试。" });
      return;
    }
    const next = applyFinalTestPatch(session, req.body || {});
    const riskSummary = buildFinalTestRiskSnapshot(next.riskLog);
    const persisted = await writeFinalTestSession(query, next);
    res.json({
      ok: true,
      experimentTask,
      session: {
        ...persisted,
        riskSummary,
      },
    });
  });

  app.post("/api/classroom/final-test/session/turnback", requireChatAuth, async (req, res) => {
    const passphrase = String(req.body?.passphrase || "").trim();
    const reason = sanitizeText(req.body?.reason, "", 240);
    const fromStage = String(req.body?.fromStage || "").trim();
    const toStage = String(req.body?.toStage || "").trim();
    const configuredPassphrase = readConfiguredPassphrase("FINAL_TEST_TURNBACK_PASSPHRASE");
    if (!configuredPassphrase) {
      res.status(500).json({ error: "系统未配置回退口令。" });
      return;
    }
    if (passphrase !== configuredPassphrase) {
      res.status(400).json({ error: "回退口令错误。" });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: "请填写回退原因。" });
      return;
    }

    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const debugMode = isFinalTestDebugRequest(req);
    const { query, session, experimentTask } = await readFinalTestSessionRecord({
      teacherScopeKey: req.authTeacherScopeKey,
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      authUser: req.authUser,
      debugMode,
    });
    if (!experimentTask.enabled) {
      res.status(403).json({ error: "当前班级未开放期末测试。" });
      return;
    }

    const targetStatus =
      toStage === "stage1"
        ? "stage1_draft"
        : toStage === "stage2"
          ? "stage2_active"
          : session.status;
    const turnbackEvent = {
      eventId: `turnback-${Date.now().toString(36)}`,
      fromStage,
      toStage,
      passphraseAccepted: true,
      reason,
      createdAt: new Date().toISOString(),
    };
    const persisted = await writeFinalTestSession(
      query,
      applyFinalTestPatch(session, {
        status: targetStatus,
        turnbackEvents: [
          ...(Array.isArray(session.turnbackEvents) ? session.turnbackEvents : []),
          turnbackEvent,
        ],
      }),
    );
    res.json({
      ok: true,
      experimentTask,
      session: persisted,
    });
  });

  app.post("/api/classroom/final-test/session/restart", requireChatAuth, async (req, res) => {
    const passphrase = String(req.body?.passphrase || "").trim();
    const reason = sanitizeText(req.body?.reason, "", 240);
    const configuredPassphrase = readConfiguredPassphrase("FINAL_TEST_RESTART_PASSPHRASE");
    if (!configuredPassphrase) {
      res.status(500).json({ error: "系统未配置重新开始口令。" });
      return;
    }
    if (passphrase !== configuredPassphrase) {
      res.status(400).json({ error: "重新开始口令错误。" });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: "请填写重新开始原因。" });
      return;
    }

    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const debugMode = isFinalTestDebugRequest(req);
    const { query, session, experimentTask } = await readFinalTestSessionRecord({
      teacherScopeKey: req.authTeacherScopeKey,
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      authUser: req.authUser,
      debugMode,
    });
    if (!experimentTask.enabled) {
      res.status(403).json({ error: "当前班级未开放期末测试。" });
      return;
    }

    const nowIso = new Date().toISOString();
    const archivedSession = normalizeFinalTestSession(session);
    const restartEvent = {
      eventId: `restart-${Date.now().toString(36)}`,
      kind: "restart",
      previousStatus: session.status,
      previousStartedAt: session.startedAt,
      previousSession: {
        status: archivedSession.status,
        startedAt: archivedSession.startedAt,
        lockedAt: archivedSession.lockedAt,
        submittedAt: archivedSession.submittedAt,
        timeExpired: archivedSession.timeExpired === true,
        durationMinutes: archivedSession.durationMinutes,
        stage1: archivedSession.stage1,
        stage2: archivedSession.stage2,
        stage3: archivedSession.stage3,
        riskLog: Array.isArray(archivedSession.riskLog) ? archivedSession.riskLog : [],
      },
      passphraseAccepted: true,
      reason,
      createdAt: nowIso,
    };
    const restartedSession = createFinalTestSessionBase({
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      variant: experimentTask.variant,
      startedAt: nowIso,
      nowIso,
      durationMinutes: experimentTask.durationMinutes,
    });
    const persisted = await writeFinalTestSession(
      query,
      applyFinalTestPatch(restartedSession, {
        turnbackEvents: [
          ...(Array.isArray(session.turnbackEvents) ? session.turnbackEvents : []),
          restartEvent,
        ],
        riskLog: Array.isArray(session.riskLog) ? session.riskLog : [],
      }),
    );
    res.json({
      ok: true,
      experimentTask,
      session: persisted,
    });
  });

  app.post("/api/classroom/final-test/session/submit", requireChatAuth, async (req, res) => {
    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const debugMode = isFinalTestDebugRequest(req);
    const { query, session, experimentTask } = await readFinalTestSessionRecord({
      teacherScopeKey: req.authTeacherScopeKey,
      studentUserId: req.authUser?._id,
      className: userProfile.className,
      authUser: req.authUser,
      debugMode,
    });
    if (!experimentTask.enabled) {
      res.status(403).json({ error: "当前班级未开放期末测试。" });
      return;
    }
    const persisted = await writeFinalTestSession(
      query,
      applyFinalTestPatch(session, {
        status: "submitted",
        submittedAt: new Date().toISOString(),
      }),
    );
    res.json({
      ok: true,
      experimentTask,
      session: persisted,
    });
  });

  app.put("/api/classroom/seat-layout/assignment", requireChatAuth, async (req, res) => {
    const profile = sanitizeUserProfile(req.authUser?.profile);
    const className = sanitizeSeatLayoutClassName(profile.className);
    if (!className) {
      res.status(400).json({ error: "请先完善班级信息后再填写座位。" });
      return;
    }

    const config = await readAdminAgentConfig();
    const seatLayoutsByClass = normalizeSeatLayoutsByClassFromConfig(config);
    const currentLayout = sanitizeAdminClassroomSeatLayoutPayload(seatLayoutsByClass[className] || null);
    if (!currentLayout.studentFillEnabled) {
      res.status(403).json({ error: "教师暂未开放学生填写座位。" });
      return;
    }
    if (currentLayout.teacherLocked) {
      res.status(403).json({ error: "教师已锁定当前班级座位，暂不可修改。" });
      return;
    }

    const identity = buildStudentSeatIdentity(req.authUser, profile);
    const currentSeatIndex = findSeatIndexByIdentityTokens(currentLayout.seats, identity.tokenSet);
    const incomingSeatIndexRaw = req.body?.seatIndex;
    const incomingSeatIndexText = String(incomingSeatIndexRaw ?? "").trim();
    const clearAssignment =
      incomingSeatIndexRaw === null ||
      incomingSeatIndexText === "" ||
      incomingSeatIndexText.toLowerCase() === "clear";
    const nextSeats = [...currentLayout.seats];
    if (currentSeatIndex >= 0) {
      nextSeats[currentSeatIndex] = "";
    }

    if (!clearAssignment) {
      const targetSeatIndex = sanitizeRuntimeInteger(
        incomingSeatIndexRaw,
        -1,
        0,
        nextSeats.length - 1,
      );
      if (targetSeatIndex < 0 || targetSeatIndex >= nextSeats.length) {
        res.status(400).json({ error: "座位编号无效，请刷新后重试。" });
        return;
      }
      const occupiedValue = String(nextSeats[targetSeatIndex] || "").trim();
      const occupiedToken = normalizeSeatValueToken(occupiedValue);
      if (occupiedValue && !identity.tokenSet.has(occupiedToken)) {
        res.status(409).json({ error: "该座位已被占用，请选择其他座位。" });
        return;
      }
      nextSeats[targetSeatIndex] = identity.displayValue;
    }

    seatLayoutsByClass[className] = {
      ...currentLayout,
      seats: nextSeats,
      updatedAt: new Date().toISOString(),
    };

    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          seatLayoutsByClass,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
    const normalizedConfig = normalizeAdminConfigDoc(doc);
    const nextLayout = buildSeatLayoutResponseForUser(
      normalizedConfig.seatLayoutsByClass,
      className,
      req.authUser,
      profile,
    );

    res.json({
      ok: true,
      seatLayout: nextLayout,
    });
  });

  app.get("/api/classroom/homework/submissions/me", requireChatAuth, async (req, res) => {
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    if (teacherScopeKey !== SHANGGUAN_FUZE_TEACHER_SCOPE_KEY) {
      res.status(403).json({ error: "当前班级暂不支持作业上传。" });
      return;
    }

    const config = await readAdminAgentConfig();
    const userProfile = sanitizeUserProfile(req.authUser?.profile);
    const userClassName = sanitizeClassroomUserClassName(userProfile.className);
    const lessons = config.teacherCoursePlans
      .map((lesson) => ({
        id: sanitizeId(lesson?.id, ""),
        courseName: sanitizeText(lesson?.courseName, "", 80),
        className: resolveClassroomLessonClassName(lesson),
        courseStartAt: sanitizeIsoDate(lesson?.courseStartAt) || "",
        courseEndAt: sanitizeIsoDate(lesson?.courseEndAt) || "",
        courseTime: sanitizeText(lesson?.courseTime, "", 120),
        homeworkRequirementText: normalizeClassroomHomeworkRequirementText(
          lesson?.homeworkRequirementText,
        ),
        homeworkUploadEnabled: sanitizeRuntimeBoolean(lesson?.homeworkUploadEnabled, true),
        lateSubmissionEnabled: sanitizeRuntimeBoolean(lesson?.lateSubmissionEnabled, false),
        enabled: sanitizeRuntimeBoolean(lesson?.enabled, true),
      }))
      .filter((lesson) => !userClassName || lesson.className === userClassName)
      .filter((lesson) => lesson.id);

    if (lessons.length === 0) {
      res.json({
        ok: true,
        teacherScopeKey,
        lessons: [],
        submissionsByLesson: {},
      });
      return;
    }

    const lessonIds = lessons.map((lesson) => lesson.id);
    const studentUserId = sanitizeId(req.authUser?._id, "");
    const docs = await ClassroomHomeworkFile.find({
      key: ADMIN_CONFIG_KEY,
      teacherScopeKey,
      studentUserId,
      lessonId: { $in: lessonIds },
    })
      .sort({ uploadedAt: -1, _id: -1 })
      .lean();

    const submissionsByLesson = {};
    docs.forEach((doc) => {
      const lessonId = sanitizeId(doc?.lessonId, "");
      if (!lessonId) return;
      if (!Array.isArray(submissionsByLesson[lessonId])) {
        submissionsByLesson[lessonId] = [];
      }
      submissionsByLesson[lessonId].push(normalizeClassroomHomeworkFileDoc(doc));
    });

    res.json({
      ok: true,
      teacherScopeKey,
      lessons,
      submissionsByLesson,
    });
  });

  app.post(
    "/api/classroom/homework/submissions/:lessonId/files",
    requireChatAuth,
    studentHomeworkUpload.array("files", STUDENT_HOMEWORK_UPLOAD_MAX_FILES),
    async (req, res) => {
      const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
      if (teacherScopeKey !== SHANGGUAN_FUZE_TEACHER_SCOPE_KEY) {
        res.status(403).json({ error: "当前班级暂不支持作业上传。" });
        return;
      }

      const lessonId = sanitizeId(req.params.lessonId, "");
      if (!lessonId) {
        res.status(400).json({ error: "课时标识无效。" });
        return;
      }

      const selectionEntriesRaw = readJsonLikeField(
        req.body?.selectionEntries,
        [],
      );
      const selectionEntries = Array.isArray(selectionEntriesRaw)
        ? selectionEntriesRaw
        : [];
      if (
        selectionEntries.some(
          (entry) =>
            String(entry?.kind || "")
              .trim()
              .toLowerCase() === "directory",
        )
      ) {
        res
          .status(400)
          .json({ error: CLASSROOM_HOMEWORK_DIRECTORY_UPLOAD_ERROR });
        return;
      }

      const sourceFiles = Array.isArray(req.files) ? req.files : [];
      const normalizedFiles = sourceFiles
        .map((file) => normalizeMultipartUploadFile(file))
        .filter((file) => file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0);
      if (normalizedFiles.length === 0) {
        res.status(400).json({ error: "请先选择要上传的作业文件。" });
        return;
      }

      const config = await readAdminAgentConfig();
      const lessonIndex = config.teacherCoursePlans.findIndex(
        (lesson) => sanitizeId(lesson?.id, "") === lessonId,
      );
      if (lessonIndex < 0) {
        res.status(404).json({ error: "未找到该课时，请刷新后重试。" });
        return;
      }
      const lesson = config.teacherCoursePlans[lessonIndex];
      if (!sanitizeRuntimeBoolean(lesson?.enabled, true)) {
        res.status(403).json({ error: "该课时暂未开放，无法上传作业。" });
        return;
      }
      if (!sanitizeRuntimeBoolean(lesson?.homeworkUploadEnabled, true)) {
        res.status(403).json({ error: "本节课无需交作业。" });
        return;
      }
      const lessonStartMs = Date.parse(lesson?.courseStartAt || "");
      const isPastLesson = Number.isFinite(lessonStartMs) && lessonStartMs < Date.now();
      if (isPastLesson && !sanitizeRuntimeBoolean(lesson?.lateSubmissionEnabled, false)) {
        res.status(403).json({ error: "该课时未开放补交，无法上传作业。" });
        return;
      }
      const studentUserId = sanitizeId(req.authUser?._id, "");
      if (!studentUserId) {
        res.status(401).json({ error: "登录状态无效，请重新登录后再上传。" });
        return;
      }

      const currentCount = await ClassroomHomeworkFile.countDocuments({
        key: ADMIN_CONFIG_KEY,
        teacherScopeKey,
        lessonId,
        studentUserId,
      });
      if (currentCount + normalizedFiles.length > STUDENT_HOMEWORK_MAX_FILES_PER_LESSON_PER_STUDENT) {
        res.status(400).json({
          error: `每节课最多上传 ${STUDENT_HOMEWORK_MAX_FILES_PER_LESSON_PER_STUDENT} 份作业，请删除后再上传。`,
        });
        return;
      }

      const customFileNamesRaw = readJsonLikeField(req.body?.fileNames, []);
      const customFileNames = Array.isArray(customFileNamesRaw) ? customFileNamesRaw : [];
      const profile = sanitizeUserProfile(req.authUser?.profile);
      const studentName = sanitizeText(
        profile.name || req.authUser?.username,
        sanitizeText(req.authUser?.username, "", 64),
        64,
      );
      const studentId = sanitizeText(profile.studentId, "", 20);
      const className = sanitizeText(profile.className, "", 40);
      const nowIso = new Date().toISOString();
      const newFileDocs = [];
      try {
        for (let fileIndex = 0; fileIndex < normalizedFiles.length; fileIndex += 1) {
          const file = normalizedFiles[fileIndex];
          const renamedFileName = sanitizeGroupChatFileName(
            customFileNames[fileIndex] || file.originalname || `作业文件-${fileIndex + 1}`,
          );
          const uploaded = await uploadStudentHomeworkFileToOss({
            lesson,
            lessonIndex,
            file,
            fileNameOverride: renamedFileName,
            studentName,
            studentId,
            studentUserId,
          });
          const fileId = createClassroomHomeworkFileId();
          newFileDocs.push({
            key: ADMIN_CONFIG_KEY,
            teacherScopeKey,
            fileId,
            lessonId,
            lessonName: sanitizeText(lesson?.courseName, "", 80),
            studentUserId,
            studentUsername: sanitizeText(req.authUser?.username, "", 80),
            studentName,
            studentId,
            className,
            fileName: sanitizeGroupChatFileName(uploaded.fileName || renamedFileName),
            originalFileName: sanitizeGroupChatFileName(file.originalname || renamedFileName),
            mimeType: sanitizeGroupChatFileMimeType(uploaded.mimeType || file.mimetype),
            size: sanitizeRuntimeInteger(uploaded.size, 0, 0, STUDENT_HOMEWORK_MAX_FILE_SIZE_BYTES),
            storageType: "oss",
            ossKey: sanitizeGroupChatOssObjectKey(uploaded.ossKey),
            ossBucket: sanitizeAliyunOssBucket(uploaded.ossBucket),
            ossRegion: sanitizeAliyunOssRegion(uploaded.ossRegion),
            fileUrl: sanitizeGroupChatHttpUrl(uploaded.fileUrl),
            binary: Buffer.alloc(0),
            uploadedAt: new Date(nowIso),
          });
        }
      } catch (error) {
        for (const uploadedDoc of newFileDocs) {
          const ossKey = sanitizeGroupChatOssObjectKey(uploadedDoc.ossKey);
          if (!ossKey) continue;
          await deleteGroupChatOssObject(ossKey).catch(() => {});
        }
        throw error;
      }

      if (newFileDocs.length === 0) {
        res.status(400).json({ error: "作业文件为空，请重新选择后上传。" });
        return;
      }

      await ClassroomHomeworkFile.insertMany(newFileDocs, { ordered: true });
      const lessonDocs = await ClassroomHomeworkFile.find({
        key: ADMIN_CONFIG_KEY,
        teacherScopeKey,
        lessonId,
        studentUserId,
      })
        .sort({ uploadedAt: -1, _id: -1 })
        .lean();

      res.json({
        ok: true,
        lessonId,
        submissions: lessonDocs.map((doc) => normalizeClassroomHomeworkFileDoc(doc)),
        uploadedAt: nowIso,
      });
    },
  );

  app.delete(
    "/api/classroom/homework/submissions/:lessonId/files/:fileId",
    requireChatAuth,
    async (req, res) => {
      const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
      if (teacherScopeKey !== SHANGGUAN_FUZE_TEACHER_SCOPE_KEY) {
        res.status(403).json({ error: "当前班级暂不支持作业上传。" });
        return;
      }

      const lessonId = sanitizeId(req.params.lessonId, "");
      const fileId = sanitizeId(req.params.fileId, "");
      if (!lessonId || !fileId) {
        res.status(400).json({ error: "作业文件标识无效。" });
        return;
      }

      const studentUserId = sanitizeId(req.authUser?._id, "");
      if (!studentUserId) {
        res.status(401).json({ error: "登录状态无效，请重新登录后重试。" });
        return;
      }

      const removedDoc = await ClassroomHomeworkFile.findOneAndDelete({
        key: ADMIN_CONFIG_KEY,
        teacherScopeKey,
        lessonId,
        fileId,
        studentUserId,
      }).lean();
      if (!removedDoc) {
        res.status(404).json({ error: "作业文件不存在或已被删除。" });
        return;
      }

      const removedOssKey = sanitizeGroupChatOssObjectKey(removedDoc?.ossKey);
      if (removedOssKey) {
        await deleteGroupChatOssObject(removedOssKey).catch(() => {});
      }

      const lessonDocs = await ClassroomHomeworkFile.find({
        key: ADMIN_CONFIG_KEY,
        teacherScopeKey,
        lessonId,
        studentUserId,
      })
        .sort({ uploadedAt: -1, _id: -1 })
        .lean();

      res.json({
        ok: true,
        lessonId,
        fileId,
        submissions: lessonDocs.map((doc) => normalizeClassroomHomeworkFileDoc(doc)),
      });
    },
  );

  app.get(
    "/api/classroom/homework/files/:fileId/download",
    requireChatAuth,
    async (req, res) => {
      const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
      if (teacherScopeKey !== SHANGGUAN_FUZE_TEACHER_SCOPE_KEY) {
        res.status(403).json({ error: "当前班级暂不支持下载该作业文件。" });
        return;
      }

      const fileId = sanitizeId(req.params.fileId, "");
      if (!fileId) {
        res.status(400).json({ error: "作业文件标识无效。" });
        return;
      }

      const studentUserId = sanitizeId(req.authUser?._id, "");
      if (!studentUserId) {
        res.status(401).json({ error: "登录状态无效，请重新登录后重试。" });
        return;
      }

      const fileDoc = await ClassroomHomeworkFile.findOne({
        key: ADMIN_CONFIG_KEY,
        teacherScopeKey,
        fileId,
        studentUserId,
      }).lean();
      if (!fileDoc) {
        res.status(404).json({ error: "作业文件不存在或已失效。" });
        return;
      }

      const fileName = sanitizeGroupChatFileName(fileDoc.fileName || "作业文件.bin");
      const mimeType = sanitizeGroupChatFileMimeType(fileDoc.mimeType);
      const storageType = sanitizeGroupChatFileStorageType(fileDoc.storageType);
      const ossKey = sanitizeGroupChatOssObjectKey(fileDoc.ossKey);
      if (storageType === "oss" && ossKey) {
        const downloadUrl = await buildTeacherLessonFileDownloadUrl({
          ossKey,
          fileName,
        });
        if (!downloadUrl) {
          res.status(404).json({ error: "作业文件下载链接不可用，请稍后重试。" });
          return;
        }
        res.json({
          ok: true,
          downloadUrl,
          fileName,
          mimeType,
        });
        return;
      }

      if (!Buffer.isBuffer(fileDoc.binary) || fileDoc.binary.length === 0) {
        res.status(404).json({ error: "作业文件不存在或已失效。" });
        return;
      }
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
      res.setHeader("Content-Length", String(fileDoc.binary.length));
      res.send(fileDoc.binary);
    },
  );

  app.get("/api/user/profile", requireChatAuth, async (req, res) => {
    const profile = sanitizeUserProfile(req.authUser.profile);
    res.json({
      ok: true,
      profile,
      profileComplete: isUserProfileComplete(profile),
    });
  });

  app.post("/api/user/presence/heartbeat", requireChatAuth, async (req, res) => {
    const nowMs = Date.now();
    markUserOnlinePresence(req.authUser, nowMs);
    markUserOnlineBrowserHeartbeat(req.authUser, nowMs);
    res.json({
      ok: true,
      at: new Date(nowMs).toISOString(),
      heartbeatStaleSeconds: Math.floor(USER_BROWSER_HEARTBEAT_STALE_MS / 1000),
    });
  });

  app.put("/api/user/profile", requireChatAuth, async (req, res) => {
    const profile = sanitizeUserProfile(req.body || {});
    const errors = validateUserProfile(profile);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "用户信息不完整或格式错误。", errors });
      return;
    }

    req.authUser.profile = profile;
    await req.authUser.save();

    res.json({
      ok: true,
      profile,
      profileComplete: true,
    });
  });

  app.put("/api/chat/state", requireChatAuth, async (req, res) => {
    const nextState = sanitizeChatStateMetaPayload(req.body || {});
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    const setPayload = { userId: req.authUser._id };
    setPayload[getTeacherScopedChatStatePath("activeId", teacherScopeKey)] = nextState.activeId;
    setPayload[getTeacherScopedChatStatePath("groups", teacherScopeKey)] = nextState.groups;
    setPayload[getTeacherScopedChatStatePath("sessions", teacherScopeKey)] = nextState.sessions;
    setPayload[getTeacherScopedChatStatePath("settings", teacherScopeKey)] = nextState.settings;

    await ChatState.findOneAndUpdate(
      { userId: req.authUser._id },
      { $set: setPayload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: isDefaultTeacherScopeKey(teacherScopeKey),
      },
    );

    res.json({ ok: true });
  });

  app.put("/api/chat/state/meta", requireChatAuth, async (req, res) => {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    const stateDoc = await ChatState.findOne(
      { userId: req.authUser._id },
      { activeId: 1, sessions: 1, teacherStates: 1, settings: 1 },
    ).lean();
    const currentState = normalizeChatStateDoc(stateDoc, teacherScopeKey);
    const nextActiveId = resolveActiveId(
      payload.activeId,
      currentState.sessions,
      currentState.activeId,
    );
    const nextSettings = sanitizeStateSettings(payload.settings);
    const setPayload = { userId: req.authUser._id };
    setPayload[getTeacherScopedChatStatePath("activeId", teacherScopeKey)] =
      nextActiveId;
    setPayload[getTeacherScopedChatStatePath("settings", teacherScopeKey)] =
      nextSettings;

    await ChatState.findOneAndUpdate(
      { userId: req.authUser._id },
      { $set: setPayload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: isDefaultTeacherScopeKey(teacherScopeKey),
      },
    );

    res.json({ ok: true });
  });

  app.post("/api/chat/smart-context/clear", requireChatAuth, async (req, res) => {
    const sessionId = sanitizeId(req.body?.sessionId, "");
    if (!sessionId) {
      res.status(400).json({ error: "缺少有效 sessionId。" });
      return;
    }

    await clearSessionContextRef({
      userId: String(req.authUser?._id || ""),
      teacherScopeKey: req.authTeacherScopeKey,
      sessionId,
    });

    res.json({ ok: true });
  });

  app.put("/api/chat/state/messages", requireChatAuth, async (req, res) => {
    const upserts = sanitizeSessionMessageUpsertsPayload(req.body || {});
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    if (upserts.length === 0) {
      res.json({ ok: true, updated: 0 });
      return;
    }

    const bySession = new Map();
    upserts.forEach(({ sessionId, message }) => {
      const list = bySession.get(sessionId) || [];
      list.push(message);
      bySession.set(sessionId, list);
    });

    const stateDoc = await ChatState.findOne(
      { userId: req.authUser._id },
      { sessionMessages: 1, sessions: 1, teacherStates: 1 },
    ).lean();
    const currentState = normalizeChatStateDoc(stateDoc, teacherScopeKey);
    const sourceMessages = currentState.sessionMessages;
    const existingSessionIds = new Set(
      (Array.isArray(currentState.sessions) ? currentState.sessions : [])
        .map((session) => sanitizeId(session?.id, ""))
        .filter(Boolean),
    );

    const setPayload = { userId: req.authUser._id };
    bySession.forEach((updates, sessionId) => {
      if (!existingSessionIds.has(sessionId)) return;
      const currentList = Array.isArray(sourceMessages[sessionId])
        ? sourceMessages[sessionId].slice(0, 400)
        : [];
      const mergedList = mergeSanitizedChatMessageLists(currentList, updates);

      setPayload[getTeacherScopedChatStatePath(`sessionMessages.${sessionId}`, teacherScopeKey)] =
        mergedList.slice(0, 400);
    });

    await ChatState.findOneAndUpdate(
      { userId: req.authUser._id },
      { $set: setPayload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: isDefaultTeacherScopeKey(teacherScopeKey),
      },
    );

    res.json({ ok: true, updated: upserts.length });
  });

  app.get("/api/chat/attachments/download", requireChatAuth, async (req, res) => {
    const chatUserId = sanitizeId(req.authUser?._id, "");
    const storageUserId = sanitizeId(req.authStorageUserId || req.authUser?._id, "");
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    const sessionId = sanitizeId(req.query?.sessionId, "");
    const messageId = sanitizeId(req.query?.messageId, "");
    const attachmentIndex = sanitizeRuntimeInteger(req.query?.attachmentIndex, -1, -1, 7);
    const fallbackFileName = sanitizeGroupChatFileName(req.query?.fileName || "聊天附件.bin");
    const fallbackMimeType = sanitizeGroupChatFileMimeType(req.query?.mimeType);
    const fallbackOssKey = sanitizeGroupChatOssObjectKey(req.query?.ossKey);
    const fallbackDirectUrl = sanitizeGroupChatHttpUrl(req.query?.url);
    const mode =
      String(req.query?.mode || "").trim().toLowerCase() === "inline"
        ? "inline"
        : "download";

    if ((!chatUserId || !sessionId || !messageId || attachmentIndex < 0) && !fallbackOssKey && !fallbackDirectUrl) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }

    let fileName = fallbackFileName;
    let mimeType = fallbackMimeType;
    let ossKey = fallbackOssKey;
    let directUrl = fallbackDirectUrl;

    if (chatUserId && sessionId && messageId && attachmentIndex >= 0) {
      const stateDoc = await ChatState.findOne(
        { userId: chatUserId },
        { sessionMessages: 1, teacherStates: 1 },
      ).lean();
      const currentState = normalizeChatStateDoc(stateDoc, teacherScopeKey);
      const currentMessages = Array.isArray(currentState.sessionMessages?.[sessionId])
        ? currentState.sessionMessages[sessionId]
        : [];
      const message =
        currentMessages.find((item) => sanitizeId(item?.id, "") === messageId) || null;

      if (message) {
        const attachments = Array.isArray(message.attachments) ? message.attachments : [];
        const attachment = attachments[attachmentIndex] || null;
        if (attachment) {
          fileName = sanitizeGroupChatFileName(
            attachment?.name || fileName || `聊天附件-${attachmentIndex + 1}.bin`,
          );
          mimeType = sanitizeGroupChatFileMimeType(attachment?.type || mimeType);
          ossKey = ossKey || sanitizeGroupChatOssObjectKey(attachment?.ossKey);
          directUrl = directUrl || sanitizeGroupChatHttpUrl(attachment?.url || attachment?.fileUrl);

          if (!ossKey || !directUrl) {
            const uploadedContextDoc = await UploadedFileContext.findOne({
              userId: storageUserId,
              sessionId,
              messageId,
            })
              .select({ ossFiles: 1 })
              .lean();
            const resolved = resolveChatAttachmentLinkFromOssFiles(
              attachment,
              attachmentIndex,
              uploadedContextDoc?.ossFiles,
            );
            if (resolved) {
              ossKey = ossKey || sanitizeGroupChatOssObjectKey(resolved.ossKey);
              directUrl = directUrl || sanitizeGroupChatHttpUrl(resolved.url);
            }
          }
        }
      }
    }

    if (ossKey) {
      const downloadUrl =
        (await buildGroupChatFileSignedDownloadUrl({
          ossKey,
          fileName,
          disposition: mode === "inline" ? "inline" : "attachment",
        })) ||
        (await buildTeacherLessonFileDownloadUrl({
          ossKey,
          fileName,
        })) ||
        directUrl ||
        buildGroupChatOssObjectUrl(ossKey);
      if (!downloadUrl) {
        res.status(500).json({ error: "附件下载地址生成失败，请稍后重试。" });
        return;
      }
      console.log(
        `[chat-file-storage] 下载链接已生成：key=${ossKey}, mode=${mode}, expiresAt=${
          readSignedUrlExpiryText(downloadUrl) || "unknown"
        }`,
      );
      res.json({
        ok: true,
        downloadUrl,
        fileName,
        mimeType,
        mode,
      });
      return;
    }

    if (directUrl) {
      res.json({
        ok: true,
        downloadUrl: directUrl,
        fileName,
        mimeType,
        mode,
      });
      return;
    }

    res.status(404).json({ error: "附件缺少可下载地址。" });
  });

  app.post("/api/auth/register", registrationRateLimiter, async (req, res) => {
    const registrationRole = String(req.body?.registrationRole || "student")
      .trim()
      .toLowerCase();
    if (!new Set(["student", "teacher"]).has(registrationRole)) {
      res.status(400).json({ error: "请选择学生或教师身份。" });
      return;
    }

    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    if (!username) {
      res.status(400).json({ error: "请输入 2–64 位且不含空格的用户名。" });
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const usernameKey = toUsernameKey(username);
    if (isReservedAdminUsernameKey(usernameKey)) {
      res.status(400).json({ error: "该用户名为系统保留账号，请更换后重试。" });
      return;
    }

    const profile = sanitizeUserProfile(req.body?.profile);
    let role = "user";
    let accountTag = "self_registration";
    let accountStatus = ACCOUNT_STATUS_PENDING_BINDING;
    let lockedTeacherScopeKey = "";

    if (registrationRole === "teacher") {
      if (!TEACHER_REGISTRATION_INVITE_CODE) {
        res.status(503).json({ error: "教师注册尚未开放，请联系系统管理员。" });
        return;
      }
      if (
        !isPairProgrammingInviteCodeValid(
          req.body?.teacherInviteCode,
          TEACHER_REGISTRATION_INVITE_CODE,
        )
      ) {
        res.status(403).json({ error: "教师邀请码不正确。" });
        return;
      }
      if (!profile.name || !/^[\u4e00-\u9fa5]+$/.test(profile.name)) {
        res.status(400).json({ error: "请填写真实的中文教师姓名。" });
        return;
      }
      role = "admin";
      accountTag = SELF_REGISTERED_TEACHER_ACCOUNT_TAG;
      accountStatus = ACCOUNT_STATUS_ACTIVE;
      lockedTeacherScopeKey = SHI_GAOJUN_TEACHER_SCOPE_KEY;
    } else {
      const profileErrors = validateUserProfile(profile);
      if (Object.keys(profileErrors).length > 0) {
        res.status(400).json({
          error: "请完整填写正确的学生信息。",
          errors: profileErrors,
        });
        return;
      }
      if (
        !isPairProgrammingInviteCodeValid(
          req.body?.classInviteCode,
          PAIR_PROGRAMMING_INVITE_CODE,
        )
      ) {
        res.status(403).json({ error: "结对编程课堂邀请码不正确。" });
        return;
      }
    }

    try {
      const existing = await AuthUser.findOne({ usernameKey })
        .select({ _id: 1 })
        .lean();
      if (existing) {
        res.status(409).json({ error: "该账号已存在，请更换用户名。" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const user = await AuthUser.create({
        username,
        usernameKey,
        role,
        passwordHash,
        accountTag,
        accountStatus,
        lockedTeacherScopeKey,
        profile,
      });

      res.status(201).json({
        ok: true,
        registrationRole,
        accountStatus,
        requiresTeacherBinding:
          accountStatus === ACCOUNT_STATUS_PENDING_BINDING,
        user: toPublicUser(user),
      });
    } catch (error) {
      if (Number(error?.code) === 11000) {
        res.status(409).json({ error: "该账号已存在，请更换用户名。" });
        return;
      }
      res.status(500).json({ error: error?.message || "注册失败，请稍后重试。" });
    }
  });

  app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const teacherScopeKey = sanitizeTeacherScopeKey(req.body?.teacherScopeKey);
    if (!username || !password) {
      res.status(400).json({ error: "请输入账号和密码。" });
      return;
    }
    if (teacherScopeKey !== SHI_GAOJUN_TEACHER_SCOPE_KEY) {
      res.status(400).json({ error: "当前入口仅支持施高俊老师的结对编程课堂。" });
      return;
    }

    const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) });
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !valid) {
      res.status(401).json({ error: "账号或密码错误。" });
      return;
    }

    const accountStatus = readAccountStatus(user);
    if (accountStatus === ACCOUNT_STATUS_PENDING_BINDING) {
      res.status(403).json({
        error: "账号已注册，正在等待施高俊老师确认并绑定学生身份。",
      });
      return;
    }
    if (accountStatus === ACCOUNT_STATUS_DISABLED) {
      res.status(403).json({ error: "该账号已停用，请联系指导教师。" });
      return;
    }

    const lockedTeacherScopeKey = resolveLoginLockedTeacherScopeKey(user);
    if (
      lockedTeacherScopeKey &&
      lockedTeacherScopeKey !== SHI_GAOJUN_TEACHER_SCOPE_KEY
    ) {
      res.status(403).json({ error: "该账号不属于当前结对编程课堂。" });
      return;
    }
    const effectiveTeacherScopeKey = SHI_GAOJUN_TEACHER_SCOPE_KEY;
    const pairProgrammingAccess = isPairProgrammingTeacherScope(
      effectiveTeacherScopeKey,
    );
    if (
      pairProgrammingAccess &&
      !isPairProgrammingInviteCodeValid(
        req.body?.inviteCode,
        PAIR_PROGRAMMING_INVITE_CODE,
      )
    ) {
      res.status(403).json({ error: "结对编程邀请码不正确。" });
      return;
    }

    const token = signToken(
      {
        uid: String(user._id),
        role: user.role,
        scope: "chat",
        tkey: effectiveTeacherScopeKey,
        pairProgrammingAccess,
      },
      AUTH_TOKEN_TTL_SECONDS,
    );
    markUserOnlinePresence(user);

    res.json({
      ok: true,
      token,
      user: toPublicUser(user),
      teacherScopeKey: effectiveTeacherScopeKey,
      teacherScopeLabel: getTeacherScopeLabel(effectiveTeacherScopeKey),
    });
  });

  app.post("/api/auth/admin/login", loginRateLimiter, async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    if (!username) {
      res.status(400).json({ error: "请选择管理员账号。" });
      return;
    }

    if (!password) {
      res.status(400).json({ error: "请输入管理员密码。" });
      return;
    }

    const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) });
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    const isAdmin =
      isTeacherAdminUser(user) &&
      readAccountStatus(user) === ACCOUNT_STATUS_ACTIVE;

    if (!valid || !isAdmin) {
      res.status(401).json({ error: "管理员账号或密码错误。" });
      return;
    }

    const token = signToken(
      { uid: String(user._id), role: "admin", scope: "admin" },
      ADMIN_TOKEN_TTL_SECONDS,
    );

    res.json({
      ok: true,
      token,
      user: toPublicUser(user),
    });
  });

  app.post("/api/auth/admin/chat-session", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;

    const isInviteRegisteredTeacher =
      String(admin?.accountTag || "").trim() ===
      SELF_REGISTERED_TEACHER_ACCOUNT_TAG;
    const teacherScopeKey = isInviteRegisteredTeacher
      ? SHI_GAOJUN_TEACHER_SCOPE_KEY
      : sanitizeTeacherScopeKey(
          req.body?.teacherScopeKey || SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
        );
    const token = signToken(
      {
        uid: String(admin._id),
        role: String(admin.role || "admin").trim().toLowerCase() || "admin",
        scope: "chat",
        tkey: teacherScopeKey,
      },
      AUTH_TOKEN_TTL_SECONDS,
    );
    markUserOnlinePresence(admin);

    res.json({
      ok: true,
      token,
      user: toPublicUser(admin),
      teacherScopeKey,
      teacherScopeLabel: getTeacherScopeLabel(teacherScopeKey),
    });
  });

  app.get("/api/auth/admin/agent-prompts", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const config = await readAdminAgentConfig();
    res.json(buildAdminAgentSettingsResponse(config));
  });

  app.put("/api/auth/admin/agent-prompts", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const prompts = sanitizeAgentPromptPayload(req.body?.prompts);
    const previous = await readAdminAgentConfig();
    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          agentSystemPrompts: prompts,
          agentRuntimeConfigs: previous.runtimeConfigs,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    const config = normalizeAdminConfigDoc(doc);
    res.json(buildAdminAgentSettingsResponse(config));
  });

  app.get("/api/auth/admin/agent-settings", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const config = await readAdminAgentConfig();
    res.json(buildAdminAgentSettingsResponse(config));
  });

  app.put("/api/auth/admin/agent-settings", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const prompts = sanitizeAgentPromptPayload(req.body?.prompts);
    const runtimeConfigs = sanitizeAgentRuntimeConfigsPayload(
      req.body?.runtimeConfigs,
    );
    const previous = await readAdminAgentConfig();
    const hasGroupChatAiConfig = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "groupChatAiConfig",
    );
    const groupChatAiConfig = hasGroupChatAiConfig
      ? sanitizeGroupChatAiConfig(req.body?.groupChatAiConfig)
      : previous.groupChatAiConfig;
    const hasClassroomToggle = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "shangguanClassTaskProductImprovementEnabled",
    );
    const shangguanClassTaskProductImprovementEnabled = hasClassroomToggle
      ? sanitizeRuntimeBoolean(req.body?.shangguanClassTaskProductImprovementEnabled, false)
      : !!previous.shangguanClassTaskProductImprovementEnabled;

    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          agentSystemPrompts: prompts,
          agentRuntimeConfigs: runtimeConfigs,
          groupChatAiConfig,
          shangguanClassTaskProductImprovementEnabled,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    const config = normalizeAdminConfigDoc(doc);
    res.json(buildAdminAgentSettingsResponse(config));
  });

  app.get("/api/auth/admin/classroom-settings", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const config = await readAdminAgentConfig();
    res.json({
      ok: true,
      firstLessonDate: CLASSROOM_FIRST_LESSON_DATE,
      questionnaireUrl: CLASSROOM_QUESTIONNAIRE_URL,
      shangguanClassTaskProductImprovementEnabled:
        !!config.shangguanClassTaskProductImprovementEnabled,
      teacherCoursePlans: config.teacherCoursePlans,
      heartbeatIntervalSeconds: Math.floor(USER_BROWSER_HEARTBEAT_INTERVAL_MS / 1000),
      heartbeatStaleSeconds: Math.floor(USER_BROWSER_HEARTBEAT_STALE_MS / 1000),
      finalTestConfig: normalizeFinalTestContentConfig(config.finalTestConfig),
      updatedAt: config.updatedAt,
    });
  });

  app.put("/api/auth/admin/classroom-settings", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const shangguanClassTaskProductImprovementEnabled = sanitizeRuntimeBoolean(
      req.body?.shangguanClassTaskProductImprovementEnabled,
      false,
    );
    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          shangguanClassTaskProductImprovementEnabled,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
    const config = normalizeAdminConfigDoc(doc);
    res.json({
      ok: true,
      firstLessonDate: CLASSROOM_FIRST_LESSON_DATE,
      questionnaireUrl: CLASSROOM_QUESTIONNAIRE_URL,
      shangguanClassTaskProductImprovementEnabled:
        !!config.shangguanClassTaskProductImprovementEnabled,
      teacherCoursePlans: config.teacherCoursePlans,
      heartbeatIntervalSeconds: Math.floor(USER_BROWSER_HEARTBEAT_INTERVAL_MS / 1000),
      heartbeatStaleSeconds: Math.floor(USER_BROWSER_HEARTBEAT_STALE_MS / 1000),
      finalTestConfig: normalizeFinalTestContentConfig(config.finalTestConfig),
      updatedAt: config.updatedAt,
    });
  });

  app.get("/api/auth/admin/final-test-config", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const config = await readAdminAgentConfig();
    res.json({
      ok: true,
      finalTestConfig: normalizeFinalTestContentConfig(config.finalTestConfig),
      updatedAt: config.updatedAt,
    });
  });

  app.put("/api/auth/admin/final-test-config", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const finalTestConfig = normalizeFinalTestContentConfig(
      req.body?.finalTestConfig,
    );
    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          finalTestConfig,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    res.json({
      ok: true,
      finalTestConfig: normalizeFinalTestContentConfig(doc?.finalTestConfig),
      updatedAt: sanitizeIsoDate(doc?.updatedAt) || new Date().toISOString(),
    });
  });

  app.get("/api/auth/admin/final-test-submissions", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;
    const [{ rosterAll, rosterByClassName }, records] = await Promise.all([
      loadFixedFinalTestRosterDirectory(teacherScopeKey),
      resolveMaybeLean(
        FinalTestSession.find({
          key: ADMIN_CONFIG_KEY,
          teacherScopeKey,
          className: {
            $in: CLASSROOM_TARGET_CLASS_NAMES,
          },
        }),
      ),
    ]);
    const sessions = (Array.isArray(records) ? records : [])
      .map((item) => {
        const normalized = normalizeFinalTestSession(item);
        return {
          studentUserId: normalized.studentUserId,
          className: normalized.className,
          variant: normalized.variant,
          status: normalized.status,
          startedAt: normalized.startedAt,
          lockedAt: normalized.lockedAt,
          submittedAt: normalized.submittedAt,
          timeExpired: normalized.timeExpired === true,
          durationMinutes: normalized.durationMinutes,
          updatedAt: sanitizeIsoDate(item?.updatedAt),
          stage3HasContent: Boolean(String(normalized.stage3?.finalText || "").trim()),
        };
      })
      .sort((a, b) => {
        const classCompare = String(a?.className || "").localeCompare(
          String(b?.className || ""),
          "zh-CN",
          { sensitivity: "base" },
        );
        if (classCompare !== 0) return classCompare;
        return String(a?.studentUserId || "").localeCompare(
          String(b?.studentUserId || ""),
          "zh-CN",
          { sensitivity: "base" },
        );
      });

    const sessionByStudentUserId = new Map();
    sessions.forEach((session) => {
      const studentUserId = sanitizeId(session?.studentUserId, "");
      if (!studentUserId || sessionByStudentUserId.has(studentUserId)) return;
      sessionByStudentUserId.set(studentUserId, session);
    });

    const classes = CLASSROOM_TARGET_CLASS_NAMES.map((className) => {
      const roster = rosterByClassName.get(className) || [];
      const students = roster.map((student) => {
        const matchedUserId = sanitizeId(student?.matchedUserId || student?.userId, "");
        const session = matchedUserId
          ? sessionByStudentUserId.get(matchedUserId) || null
          : null;
        const status = sanitizeText(session?.status, "", 40);
        return {
          studentUserId: student.userId,
          username: student.username,
          studentName: student.studentName,
          studentId: student.studentId,
          className: student.className,
          submitted: status === "submitted",
          status,
          submittedAt: sanitizeIsoDate(session?.submittedAt) || "",
          updatedAt: sanitizeIsoDate(session?.updatedAt) || "",
          stage3HasContent: session?.stage3HasContent === true,
        };
      });
      const submittedCount = students.filter((student) => student.submitted).length;
      const unlistedSessions = sessions
        .filter(
          (session) =>
            sanitizeClassroomUserClassName(session?.className) === className &&
            !roster.some(
              (student) =>
                sanitizeId(student?.matchedUserId || "", "") ===
                sanitizeId(session?.studentUserId, ""),
            ),
        )
        .map((session) => ({
          studentUserId: sanitizeId(session?.studentUserId, ""),
          className,
          submitted: sanitizeText(session?.status, "", 40) === "submitted",
          status: sanitizeText(session?.status, "", 40),
          submittedAt: sanitizeIsoDate(session?.submittedAt) || "",
          updatedAt: sanitizeIsoDate(session?.updatedAt) || "",
        }));

      return {
        className,
        studentTotal: students.length,
        submittedCount,
        pendingCount: Math.max(students.length - submittedCount, 0),
        students,
        unlistedSessions,
      };
    });

    res.json({
      ok: true,
      teacherScopeKey,
      rosterTotal: rosterAll.length,
      sessions,
      classes,
      updatedAt: new Date().toISOString(),
    });
  });

  app.post("/api/auth/admin/final-test-reopen", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const studentUserId = sanitizeId(req.body?.studentUserId, "");
    const className = sanitizeClassroomUserClassName(req.body?.className || "");
    if (!studentUserId) {
      res.status(400).json({ error: "缺少 studentUserId。" });
      return;
    }
    const teacherScopeKey = SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;
    const query = buildFinalTestSessionQuery({ teacherScopeKey, studentUserId, className });
    const record = await resolveMaybeLean(FinalTestSession.findOne(query));
    if (!record) {
      res.status(404).json({ error: "未找到该学生的期末测试记录。" });
      return;
    }
    const session = normalizeFinalTestSession(record);
    if (session.status !== "submitted") {
      res.status(400).json({ error: `当前状态为「${session.status}」，只有已提交的测试才能重新开放。` });
      return;
    }
    const reopenEvent = {
      eventId: `reopen-${Date.now().toString(36)}`,
      kind: "admin_reopen",
      fromStage: "submitted",
      toStage: "stage2",
      reason: "管理员重新开放至 AI 协作阶段",
      createdAt: new Date().toISOString(),
    };
    const patched = applyFinalTestPatch(session, {
      status: "stage2_active",
      submittedAt: "",
      timeExpired: false,
      stage2: {
        ...(session.stage2 || {}),
        submittedAt: "",
      },
      turnbackEvents: [
        ...(Array.isArray(session.turnbackEvents) ? session.turnbackEvents : []),
        reopenEvent,
      ],
    });
    patched.deadlineAt = "";
    const persisted = await writeFinalTestSession(query, patched);
    res.json({ ok: true, session: persisted });
  });

  app.get("/api/auth/admin/classroom-plans", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    const [config, authorizedClassNames] = await Promise.all([
      readAdminAgentConfig(),
      readAuthorizedClassNamesForTeacherScope(),
    ]);

    res.json({
      ok: true,
      admin: {
        id: String(admin?._id || ""),
        username: admin?.username || "",
        role: admin?.role || "admin",
      },
      firstLessonDate: CLASSROOM_FIRST_LESSON_DATE,
      questionnaireUrl: CLASSROOM_QUESTIONNAIRE_URL,
      shangguanClassTaskProductImprovementEnabled:
        !!config.shangguanClassTaskProductImprovementEnabled,
      teacherCoursePlans: config.teacherCoursePlans,
      authorizedClassNames,
      classroomDisciplineConfig: config.classroomDisciplineConfig,
      seatLayoutsByClass: normalizeSeatLayoutsByClassFromConfig(config),
      finalTestConfig: normalizeFinalTestContentConfig(config.finalTestConfig),
      updatedAt: config.updatedAt,
    });
  });

  app.get("/api/auth/admin/classroom-seat-layouts", requireAdminAuth, async (_req, res) => {
    const config = await readAdminAgentConfig();
    res.json({
      ok: true,
      seatLayoutsByClass: normalizeSeatLayoutsByClassFromConfig(config),
      updatedAt: config.updatedAt || new Date().toISOString(),
    });
  });

  app.put("/api/auth/admin/classroom-seat-layouts", requireAdminAuth, async (req, res) => {
    const seatLayoutsByClass = sanitizeAdminClassroomSeatLayoutsByClassPayload(
      req.body?.seatLayoutsByClass,
    );
    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          seatLayoutsByClass,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
    const config = normalizeAdminConfigDoc(doc);
    res.json({
      ok: true,
      seatLayoutsByClass: normalizeSeatLayoutsByClassFromConfig(config),
      updatedAt: config.updatedAt || new Date().toISOString(),
    });
  });

  app.get("/api/auth/admin/classroom-homework/overview", requireAdminAuth, async (req, res) => {
    const teacherScopeKey = SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;
    const config = await readAdminAgentConfig();
    const lessons = sortAdminClassroomCoursePlans(config.teacherCoursePlans);
    const lessonIds = lessons
      .map((lesson) => sanitizeId(lesson?.id, ""))
      .filter(Boolean);

    const [{ rosterAll, rosterByClassName, userClassByUserId }, homeworkDocs] = await Promise.all([
      loadClassroomRosterDirectory(teacherScopeKey),
      lessonIds.length > 0
        ? ClassroomHomeworkFile.find({
            key: ADMIN_CONFIG_KEY,
            teacherScopeKey,
            lessonId: { $in: lessonIds },
          })
            .sort({ uploadedAt: -1, _id: -1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const lessonStudentDocsMap = new Map();
    for (const doc of homeworkDocs) {
      const lessonId = sanitizeId(doc?.lessonId, "");
      const studentUserId = sanitizeId(doc?.studentUserId, "");
      if (!lessonId || !studentUserId) continue;
      if (!lessonStudentDocsMap.has(lessonId)) {
        lessonStudentDocsMap.set(lessonId, new Map());
      }
      const studentDocMap = lessonStudentDocsMap.get(lessonId);
      if (!studentDocMap.has(studentUserId)) {
        studentDocMap.set(studentUserId, []);
      }
      studentDocMap.get(studentUserId).push(doc);
    }

    const lessonsOverview = lessons.map((lesson, lessonIndex) => {
      const lessonId = sanitizeId(lesson?.id, "");
      const lessonClassName = resolveClassroomLessonClassName(lesson);
      const roster = rosterByClassName.get(lessonClassName) || [];
      const rosterByUserId = new Map(roster.map((student) => [student.userId, student]));
      const perStudentDocsRaw = lessonStudentDocsMap.get(lessonId) || new Map();
      const perStudentDocs = new Map();
      for (const [studentUserId, docs] of perStudentDocsRaw.entries()) {
        const sample = Array.isArray(docs) && docs.length > 0 ? docs[0] : {};
        const docClassName =
          sanitizeClassroomUserClassName(sample?.className) ||
          sanitizeClassroomUserClassName(userClassByUserId.get(studentUserId));
        if (docClassName && docClassName !== lessonClassName) continue;
        perStudentDocs.set(studentUserId, docs);
      }
      const studentRows = roster.map((student) => {
        const docs = perStudentDocs.get(student.userId) || [];
        const files = docs.map((doc) => normalizeClassroomHomeworkFileDoc(doc));
        return {
          userId: student.userId,
          username: student.username,
          studentName: student.studentName,
          studentId: student.studentId,
          className: student.className,
          submitted: files.length > 0,
          fileCount: files.length,
          latestUploadedAt: files[0]?.uploadedAt || "",
          files,
        };
      });

      const uploadedStudentCount = studentRows.filter((student) => student.submitted).length;
      const missingStudents = studentRows.filter((student) => !student.submitted);
      const unlistedStudents = Array.from(perStudentDocs.entries())
        .filter(([studentUserId]) => !rosterByUserId.has(studentUserId))
        .map(([studentUserId, docs]) => {
          const sample = docs[0] || {};
          return {
            userId: studentUserId,
            studentName: sanitizeText(sample.studentName || sample.studentUsername, "", 64) || "未登记学生",
            studentId: sanitizeText(sample.studentId, "", 20),
            className: sanitizeText(sample.className, "", 40),
            submitted: true,
            fileCount: docs.length,
            latestUploadedAt: sanitizeIsoDate(sample.uploadedAt) || "",
            files: docs.map((doc) => normalizeClassroomHomeworkFileDoc(doc)),
          };
        })
        .sort(compareClassroomRosterStudent);

      return {
        id: lessonId,
        lessonIndex,
        courseName: sanitizeText(lesson?.courseName, "", 80) || `第${lessonIndex + 1}节课`,
        className: lessonClassName,
        courseStartAt: sanitizeIsoDate(lesson?.courseStartAt) || "",
        courseEndAt: sanitizeIsoDate(lesson?.courseEndAt) || "",
        courseTime: sanitizeText(lesson?.courseTime, "", 120),
        homeworkRequirementText: normalizeClassroomHomeworkRequirementText(
          lesson?.homeworkRequirementText,
        ),
        enabled: sanitizeRuntimeBoolean(lesson?.enabled, true),
        homeworkUploadEnabled: sanitizeRuntimeBoolean(lesson?.homeworkUploadEnabled, true),
        lateSubmissionEnabled: sanitizeRuntimeBoolean(lesson?.lateSubmissionEnabled, false),
        studentTotal: roster.length,
        uploadedStudentCount,
        missingStudentCount: missingStudents.length,
        missingStudents: missingStudents.map((student) => ({
          userId: student.userId,
          studentName: student.studentName,
          studentId: student.studentId,
          className: student.className,
        })),
        students: studentRows,
        unlistedStudents,
      };
    });

    res.json({
      ok: true,
      teacherScopeKey,
      rosterTotal: rosterAll.length,
      lessons: lessonsOverview,
      updatedAt: config.updatedAt,
    });
  });

  app.get(
    "/api/auth/admin/classroom-homework/lessons/:lessonId/export",
    requireAdminAuth,
    async (req, res) => {
      const lessonId = sanitizeId(req.params.lessonId, "");
      if (!lessonId) {
        res.status(400).json({ error: "课时标识无效。" });
        return;
      }

      const teacherScopeKey = SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;
      const config = await readAdminAgentConfig();
      const lessons = sortAdminClassroomCoursePlans(config.teacherCoursePlans);
      const lessonIndex = lessons.findIndex(
        (lesson) => sanitizeId(lesson?.id, "") === lessonId,
      );
      if (lessonIndex < 0) {
        res.status(404).json({ error: "课时不存在或已被删除。" });
        return;
      }
      const lesson = lessons[lessonIndex];
      const lessonClassName = resolveClassroomLessonClassName(lesson);
      const lessonName =
        sanitizeText(lesson?.courseName, "", 80) || `第${Math.max(lessonIndex + 1, 1)}节课`;

      const [rosterUsers, lessonHomeworkDocs] = await Promise.all([
        AuthUser.find(
          {
            role: "user",
            lockedTeacherScopeKey: teacherScopeKey,
          },
          { username: 1, profile: 1, accountTag: 1 },
        ).lean(),
        ClassroomHomeworkFile.find({
          key: ADMIN_CONFIG_KEY,
          teacherScopeKey,
          lessonId,
        })
          .sort({ studentUserId: 1, uploadedAt: 1, _id: 1 })
          .lean(),
      ]);

      const rosterAll = rosterUsers
        .map((user) => {
          const profile = sanitizeUserProfile(user?.profile);
          const className = sanitizeClassroomUserClassName(profile.className);
          return {
            userId: sanitizeId(user?._id, ""),
            username: sanitizeText(user?.username, "", 64),
            studentName: sanitizeText(profile.name || user?.username, "", 64),
            studentId: sanitizeText(profile.studentId, "", 20),
            className,
          };
        })
        .filter((item) => item.userId)
        .sort(compareClassroomRosterStudent);
      const roster = rosterAll.filter((student) => student.className === lessonClassName);
      const userClassByUserId = new Map(rosterAll.map((student) => [student.userId, student.className]));
      const rosterByUserId = new Map(roster.map((student) => [student.userId, student]));
      const homeworkDocsByStudentUserId = new Map();
      lessonHomeworkDocs.forEach((doc) => {
        const studentUserId = sanitizeId(doc?.studentUserId, "");
        if (!studentUserId) return;
        const docClassName =
          sanitizeClassroomUserClassName(doc?.className) ||
          sanitizeClassroomUserClassName(userClassByUserId.get(studentUserId));
        if (docClassName && docClassName !== lessonClassName) return;
        if (!homeworkDocsByStudentUserId.has(studentUserId)) {
          homeworkDocsByStudentUserId.set(studentUserId, []);
        }
        homeworkDocsByStudentUserId.get(studentUserId).push(doc);
      });

      const missingStudents = roster.filter(
        (student) => !homeworkDocsByStudentUserId.has(student.userId),
      );
      const submittedStudents = roster.filter((student) =>
        homeworkDocsByStudentUserId.has(student.userId),
      );
      const unlistedStudents = Array.from(homeworkDocsByStudentUserId.entries())
        .filter(([studentUserId]) => !rosterByUserId.has(studentUserId))
        .map(([studentUserId, docs]) => {
          const sample = docs[0] || {};
          return {
            userId: studentUserId,
            studentName:
              sanitizeText(sample.studentName || sample.studentUsername, "", 64) ||
              "未登记学生",
            studentId: sanitizeText(sample.studentId, "", 20),
            className: sanitizeText(sample.className, "", 40),
            fileCount: docs.length,
          };
        })
        .sort(compareClassroomRosterStudent);

      function sanitizeHomeworkExportSegment(value, fallback = "unknown") {
        const safe = String(value || "")
          .replace(/\p{Cc}/gu, "")
          .replace(/[\\/:*?"<>|]/g, "_")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 72);
        return safe || fallback;
      }

      function toCsvCell(value) {
        const text = String(value ?? "");
        if (!/["\n,]/.test(text)) return text;
        return `"${text.replace(/"/g, "\"\"")}"`;
      }

      async function readHomeworkFileBuffer(fileDoc, fallbackName = "作业文件.bin") {
        const storageType = sanitizeGroupChatFileStorageType(fileDoc?.storageType);
        const safeFileName = sanitizeGroupChatFileName(
          fileDoc?.fileName || fallbackName || "作业文件.bin",
        );
        const ossKey = sanitizeGroupChatOssObjectKey(fileDoc?.ossKey);
        if (storageType === "oss" && ossKey) {
          const downloadUrl = await buildTeacherLessonFileDownloadUrl({
            ossKey,
            fileName: safeFileName,
          });
          if (downloadUrl) {
            const response = await fetch(downloadUrl, { method: "GET" });
            if (!response.ok) {
              throw new Error(`远端文件拉取失败（${response.status}）`);
            }
            const fileArrayBuffer = await response.arrayBuffer();
            const fileBuffer = Buffer.from(fileArrayBuffer);
            if (fileBuffer.length > 0) return fileBuffer;
          }
        }

        if (Buffer.isBuffer(fileDoc?.binary) && fileDoc.binary.length > 0) {
          return fileDoc.binary;
        }
        throw new Error("文件内容为空。");
      }

      const exportedAt = new Date();
      const reportLines = [
        "EduChat 作业批量导出",
        `课时：${lessonName}`,
        `授课班级：${lessonClassName}`,
        `导出时间：${formatDisplayTime(exportedAt)}`,
        `应交人数：${roster.length}`,
        `已交人数：${submittedStudents.length}`,
        `未交人数：${missingStudents.length}`,
        `花名册外提交人数：${unlistedStudents.length}`,
        "",
        "未交名单：",
        ...(missingStudents.length > 0
          ? missingStudents.map((student, index) => {
              const studentName =
                sanitizeText(student?.studentName || student?.username, "", 64) || "未命名学生";
              const studentId = sanitizeText(student?.studentId, "", 20);
              const className = sanitizeText(student?.className, "", 40);
              return `${index + 1}. ${studentName}${
                studentId ? `（${studentId}）` : ""
              }${className ? ` - ${className}` : ""}`;
            })
          : ["无"]),
      ];

      const csvRows = [
        [
          "序号",
          "学号",
          "姓名",
          "班级",
          "提交状态",
          "作业份数",
          "最近提交时间",
          "是否在花名册",
        ]
          .map((cell) => toCsvCell(cell))
          .join(","),
      ];

      roster.forEach((student, index) => {
        const docs = homeworkDocsByStudentUserId.get(student.userId) || [];
        const latestUploadedAt =
          docs.length > 0
            ? sanitizeIsoDate(docs[docs.length - 1]?.uploadedAt) || ""
            : "";
        csvRows.push(
          [
            index + 1,
            student.studentId || "",
            student.studentName || student.username || "",
            student.className || "",
            docs.length > 0 ? "已提交" : "未提交",
            docs.length,
            latestUploadedAt,
            "是",
          ]
            .map((cell) => toCsvCell(cell))
            .join(","),
        );
      });

      unlistedStudents.forEach((student, index) => {
        csvRows.push(
          [
            roster.length + index + 1,
            student.studentId || "",
            student.studentName || "",
            student.className || "",
            "已提交",
            Number(student.fileCount || 0),
            "",
            "否",
          ]
            .map((cell) => toCsvCell(cell))
            .join(","),
        );
      });

      const zipEntries = [
        {
          name: "README.txt",
          content: reportLines.join("\n"),
        },
        {
          name: "统计/提交统计.csv",
          content: Buffer.from(`\uFEFF${csvRows.join("\n")}`, "utf8"),
        },
      ];

      if (missingStudents.length > 0) {
        const missingLines = missingStudents.map((student, index) => {
          const studentName =
            sanitizeText(student?.studentName || student?.username, "", 64) || "未命名学生";
          const studentId = sanitizeText(student?.studentId, "", 20);
          const className = sanitizeText(student?.className, "", 40);
          return `${index + 1}. ${studentName}${
            studentId ? `（${studentId}）` : ""
          }${className ? ` - ${className}` : ""}`;
        });
        zipEntries.push({
          name: "统计/未交名单.txt",
          content: missingLines.join("\n"),
        });
      }

      const fileReadFailedRows = [];
      let exportedFileCount = 0;
      let serial = 0;
      for (const [studentUserId, docs] of homeworkDocsByStudentUserId.entries()) {
        const rosterStudent = rosterByUserId.get(studentUserId);
        const sample = docs[0] || {};
        const studentName =
          sanitizeText(
            rosterStudent?.studentName ||
              sample?.studentName ||
              sample?.studentUsername ||
              studentUserId,
            "",
            64,
          ) || "未命名学生";
        const studentId = sanitizeText(rosterStudent?.studentId || sample?.studentId, "", 20);
        const studentFolderName = sanitizeHomeworkExportSegment(
          `${studentName}${studentId ? `-${studentId}` : ""}`,
          `student-${serial + 1}`,
        );

        for (let fileIndex = 0; fileIndex < docs.length; fileIndex += 1) {
          const fileDoc = docs[fileIndex];
          const normalizedFile = normalizeClassroomHomeworkFileDoc(fileDoc);
          const safeFileName = sanitizeGroupChatFileName(
            normalizedFile?.name || fileDoc?.fileName || "作业文件.bin",
          );
          const entryName = sanitizeZipEntryName(
            `作业文件/${studentFolderName}/${String(fileIndex + 1).padStart(2, "0")}-${safeFileName}`,
            `作业文件/${studentFolderName}/file-${fileIndex + 1}.bin`,
          );
          try {
            const fileBuffer = await readHomeworkFileBuffer(fileDoc, safeFileName);
            zipEntries.push({ name: entryName, content: fileBuffer });
            exportedFileCount += 1;
          } catch (error) {
            fileReadFailedRows.push(
              `${studentName} / ${safeFileName}：${error?.message || "读取失败"}`,
            );
          }
        }
        serial += 1;
      }

      if (exportedFileCount === 0) {
        zipEntries.push({
          name: "作业文件/暂无可导出的作业文件.txt",
          content: "当前课时暂无可导出的作业文件。",
        });
      }

      if (fileReadFailedRows.length > 0) {
        zipEntries.push({
          name: "统计/导出失败清单.txt",
          content: fileReadFailedRows.join("\n"),
        });
      }

      const zipBuffer = buildZipBuffer(
        zipEntries.map((item) => ({
          name: sanitizeZipEntryName(item?.name, "export.txt"),
          content: item?.content,
        })),
      );
      const zipFileName = sanitizeGroupChatFileName(
        `${lessonName}-作业批量导出-${formatFileStamp(exportedAt)}.zip`,
      );
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(zipFileName));
      res.setHeader("X-Homework-Missing-Count", String(missingStudents.length));
      res.setHeader("X-Homework-Exported-File-Count", String(exportedFileCount));
      res.send(zipBuffer);
    },
  );

  app.get(
    "/api/auth/admin/classroom-homework/files/:fileId/download",
    requireAdminAuth,
    async (req, res) => {
      const fileId = sanitizeId(req.params.fileId, "");
      if (!fileId) {
        res.status(400).json({ error: "作业文件标识无效。" });
        return;
      }

      const teacherScopeKey = SHANGGUAN_FUZE_TEACHER_SCOPE_KEY;
      const fileDoc = await ClassroomHomeworkFile.findOne({
        key: ADMIN_CONFIG_KEY,
        teacherScopeKey,
        fileId,
      }).lean();
      if (!fileDoc) {
        res.status(404).json({ error: "作业文件不存在或已被移除。" });
        return;
      }

      const fileName = sanitizeGroupChatFileName(fileDoc.fileName || "作业文件.bin");
      const mimeType = sanitizeGroupChatFileMimeType(fileDoc.mimeType);
      const storageType = sanitizeGroupChatFileStorageType(fileDoc.storageType);
      const ossKey = sanitizeGroupChatOssObjectKey(fileDoc.ossKey);
      if (storageType === "oss" && ossKey) {
        const downloadUrl = await buildTeacherLessonFileDownloadUrl({
          ossKey,
          fileName,
        });
        if (!downloadUrl) {
          res.status(404).json({ error: "作业文件下载链接不可用，请稍后重试。" });
          return;
        }
        res.json({
          ok: true,
          downloadUrl,
          fileName,
          mimeType,
        });
        return;
      }

      if (!Buffer.isBuffer(fileDoc.binary) || fileDoc.binary.length === 0) {
        res.status(404).json({ error: "作业文件不存在或已失效。" });
        return;
      }
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
      res.setHeader("Content-Length", String(fileDoc.binary.length));
      res.send(fileDoc.binary);
    },
  );

  app.put("/api/auth/admin/classroom-plans", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const [previous, authorizedClassNames] = await Promise.all([
      readAdminAgentConfig(),
      readAuthorizedClassNamesForTeacherScope(),
    ]);
    const previousSeatLayoutsByClass = normalizeSeatLayoutsByClassFromConfig(previous);
    const rawPlans = sanitizeAdminClassroomCoursePlansPayload(req.body?.teacherCoursePlans);
    const authorizedClassNameSet = new Set(authorizedClassNames);
    const unauthorizedLesson = rawPlans.find(
      (lesson) => !authorizedClassNameSet.has(resolveClassroomLessonClassName(lesson)),
    );
    if (unauthorizedLesson) {
      res.status(400).json({
        error: authorizedClassNames.length > 0
          ? `课时“${sanitizeText(unauthorizedLesson.courseName, "未命名课时", 80)}”选择了未授权班级。`
          : "当前教师尚未绑定任何班级，请先在“学生与账号”中绑定学生。",
      });
      return;
    }
    const previousById = new Map(
      previous.teacherCoursePlans.map((item) => [String(item?.id || ""), item]),
    );
    const nowIso = new Date().toISOString();
    const teacherCoursePlans = rawPlans.map((item, index) => {
      const itemId = sanitizeId(item.id, `course-${index + 1}`);
      const previousItem = previousById.get(itemId);
      return {
        ...item,
        id: itemId,
        createdAt:
          sanitizeIsoDate(previousItem?.createdAt || item.createdAt) || nowIso,
        updatedAt: nowIso,
        tasks: item.tasks.map((task, taskIndex) => ({
          ...task,
          id: sanitizeId(task.id, `task-${taskIndex + 1}`),
          files: sanitizeAdminClassroomCourseFilesPayload(task?.files),
        })),
        files: item.files.map((file, fileIndex) => ({
          ...file,
          id: sanitizeId(file.id, `lesson-file-${fileIndex + 1}`),
        })),
      };
    });
    const hasClassroomToggle = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "shangguanClassTaskProductImprovementEnabled",
    );
    const shangguanClassTaskProductImprovementEnabled = hasClassroomToggle
      ? sanitizeRuntimeBoolean(req.body?.shangguanClassTaskProductImprovementEnabled, false)
      : !!previous.shangguanClassTaskProductImprovementEnabled;
    const hasSeatLayoutsPayload = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "seatLayoutsByClass",
    );
    const seatLayoutsByClass = hasSeatLayoutsPayload
      ? sanitizeAdminClassroomSeatLayoutsByClassPayload(req.body?.seatLayoutsByClass)
      : previousSeatLayoutsByClass;
    const hasDisciplineConfigPayload = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "classroomDisciplineConfig",
    );
    const classroomDisciplineConfig = hasDisciplineConfigPayload
      ? sanitizeAdminClassroomDisciplineConfigPayload(req.body?.classroomDisciplineConfig)
      : sanitizeAdminClassroomDisciplineConfigPayload(previous.classroomDisciplineConfig);

    const previousFileIds = new Set();
    previous.teacherCoursePlans.forEach((lesson) => {
      collectAdminClassroomFileIdsFromLesson(lesson).forEach((fileId) => {
        previousFileIds.add(fileId);
      });
    });

    const nextFileIds = new Set();
    teacherCoursePlans.forEach((lesson) => {
      const files = Array.isArray(lesson?.files) ? lesson.files : [];
      lesson.files = files.filter((file) => {
        const fileId = sanitizeId(file?.id, "");
        if (!fileId || nextFileIds.has(fileId)) return false;
        nextFileIds.add(fileId);
        return true;
      });
      const tasks = Array.isArray(lesson?.tasks) ? lesson.tasks : [];
      lesson.tasks = tasks.map((task) => {
        const taskFiles = Array.isArray(task?.files) ? task.files : [];
        const normalizedTaskFiles = taskFiles.filter((file) => {
          const fileId = sanitizeId(file?.id, "");
          if (!fileId || nextFileIds.has(fileId)) return false;
          nextFileIds.add(fileId);
          return true;
        });
        return {
          ...task,
          files: normalizedTaskFiles,
        };
      });
    });

    const staleFileIds = Array.from(previousFileIds).filter((fileId) => !nextFileIds.has(fileId));
    if (staleFileIds.length > 0) {
      const staleDocs = await AdminClassroomLessonFile.find({
        key: ADMIN_CONFIG_KEY,
        fileId: { $in: staleFileIds },
      }).lean();
      await AdminClassroomLessonFile.deleteMany({
        key: ADMIN_CONFIG_KEY,
        fileId: { $in: staleFileIds },
      });
      for (const staleDoc of staleDocs) {
        const ossKey = sanitizeGroupChatOssObjectKey(staleDoc?.ossKey);
        if (!ossKey) continue;
        await deleteGroupChatOssObject(ossKey).catch(() => {});
      }
    }

    const doc = await AdminConfig.findOneAndUpdate(
      { key: ADMIN_CONFIG_KEY },
      {
        $set: {
          key: ADMIN_CONFIG_KEY,
          teacherCoursePlans,
          shangguanClassTaskProductImprovementEnabled,
          classroomDisciplineConfig,
          seatLayoutsByClass,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
    const config = normalizeAdminConfigDoc(doc);

    res.json({
      ok: true,
      firstLessonDate: CLASSROOM_FIRST_LESSON_DATE,
      questionnaireUrl: CLASSROOM_QUESTIONNAIRE_URL,
      shangguanClassTaskProductImprovementEnabled:
        !!config.shangguanClassTaskProductImprovementEnabled,
      teacherCoursePlans: config.teacherCoursePlans,
      classroomDisciplineConfig: config.classroomDisciplineConfig,
      seatLayoutsByClass: normalizeSeatLayoutsByClassFromConfig(config),
      finalTestConfig: normalizeFinalTestContentConfig(config.finalTestConfig),
      updatedAt: config.updatedAt,
    });
  });

  app.post(
    "/api/auth/admin/classroom-plans/:lessonId/files",
    requireAdminAuth,
    teacherClassroomFileUpload.array(
      "files",
      ADMIN_CLASSROOM_COURSE_FILE_UPLOAD_MAX_FILES,
    ),
    async (req, res) => {
      const lessonId = sanitizeId(req.params.lessonId, "");
      if (!lessonId) {
        res.status(400).json({ error: "课时标识无效。" });
        return;
      }

      const sourceFiles = Array.isArray(req.files) ? req.files : [];
      const normalizedFiles = sourceFiles
        .map((file) => normalizeMultipartUploadFile(file))
        .filter((file) => file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0);
      if (normalizedFiles.length === 0) {
        res.status(400).json({ error: "请先选择要上传的课程文件。" });
        return;
      }

      const previous = await readAdminAgentConfig();
      const lessonIndex = previous.teacherCoursePlans.findIndex(
        (lesson) => sanitizeId(lesson?.id, "") === lessonId,
      );
      if (lessonIndex < 0) {
        res.status(404).json({ error: "未找到对应课时，请刷新后重试。" });
        return;
      }

      const targetLesson = previous.teacherCoursePlans[lessonIndex];
      const existingFiles = Array.isArray(targetLesson?.files) ? targetLesson.files : [];
      if (existingFiles.length + normalizedFiles.length > ADMIN_CLASSROOM_COURSE_FILE_MAX_ITEMS) {
        res.status(400).json({
          error: `每节课最多上传 ${ADMIN_CLASSROOM_COURSE_FILE_MAX_ITEMS} 个文件，请删除后再上传。`,
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const uploadedByAdminId = sanitizeId(req.authAdmin?._id, "");
      const newFileDocs = [];
      try {
        for (const file of normalizedFiles) {
          const uploaded = await uploadTeacherLessonFileToOss({
            lesson: targetLesson,
            lessonIndex,
            file,
          });
          const fileId = createAdminClassroomLessonFileId();
          newFileDocs.push({
            key: ADMIN_CONFIG_KEY,
            fileId,
            lessonId,
            fileName: sanitizeGroupChatFileName(uploaded.fileName || file.originalname || "课程文件.bin"),
            mimeType: sanitizeGroupChatFileMimeType(uploaded.mimeType || file.mimetype),
            size: sanitizeRuntimeInteger(
              uploaded.size,
              0,
              0,
              TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
            ),
            storageType: "oss",
            ossKey: sanitizeGroupChatOssObjectKey(uploaded.ossKey),
            ossBucket: sanitizeAliyunOssBucket(uploaded.ossBucket),
            ossRegion: sanitizeAliyunOssRegion(uploaded.ossRegion),
            fileUrl: sanitizeGroupChatHttpUrl(uploaded.fileUrl),
            binary: Buffer.alloc(0),
            uploadedByAdminId,
            uploadedAt: new Date(nowIso),
          });
        }
      } catch (error) {
        for (const uploadedDoc of newFileDocs) {
          const ossKey = sanitizeGroupChatOssObjectKey(uploadedDoc.ossKey);
          if (!ossKey) continue;
          await deleteGroupChatOssObject(ossKey).catch(() => {});
        }
        throw error;
      }

      if (newFileDocs.length === 0) {
        res.status(400).json({ error: "上传文件为空，请重新选择。" });
        return;
      }

      await AdminClassroomLessonFile.insertMany(newFileDocs, { ordered: true });

      const nextLessonFiles = sanitizeAdminClassroomCourseFilesPayload([
        ...existingFiles,
        ...newFileDocs.map((doc) => normalizeAdminClassroomLessonFileDoc(doc)),
      ]);
      const teacherCoursePlans = previous.teacherCoursePlans.map((lesson, index) => {
        if (index !== lessonIndex) return lesson;
        return {
          ...lesson,
          files: nextLessonFiles,
          updatedAt: nowIso,
        };
      });

      const doc = await AdminConfig.findOneAndUpdate(
        { key: ADMIN_CONFIG_KEY },
        {
          $set: {
            key: ADMIN_CONFIG_KEY,
            teacherCoursePlans,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean();
      const config = normalizeAdminConfigDoc(doc);

      res.json({
        ok: true,
        lessonId,
        teacherCoursePlans: config.teacherCoursePlans,
        updatedAt: config.updatedAt,
      });
    },
  );

  app.post(
    "/api/auth/admin/classroom-plans/:lessonId/tasks/:taskId/files",
    requireAdminAuth,
    teacherClassroomFileUpload.array(
      "files",
      ADMIN_CLASSROOM_COURSE_FILE_UPLOAD_MAX_FILES,
    ),
    async (req, res) => {
      const lessonId = sanitizeId(req.params.lessonId, "");
      const taskId = sanitizeId(req.params.taskId, "");
      if (!lessonId || !taskId) {
        res.status(400).json({ error: "任务标识无效。" });
        return;
      }

      const sourceFiles = Array.isArray(req.files) ? req.files : [];
      const normalizedFiles = sourceFiles
        .map((file) => normalizeMultipartUploadFile(file))
        .filter((file) => file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0);
      if (normalizedFiles.length === 0) {
        res.status(400).json({ error: "请先选择要上传的任务附件。" });
        return;
      }

      const previous = await readAdminAgentConfig();
      const lessonIndex = previous.teacherCoursePlans.findIndex(
        (lesson) => sanitizeId(lesson?.id, "") === lessonId,
      );
      if (lessonIndex < 0) {
        res.status(404).json({ error: "未找到对应课时，请刷新后重试。" });
        return;
      }

      const targetLesson = previous.teacherCoursePlans[lessonIndex];
      const taskMatch = findAdminClassroomLessonTaskById(targetLesson, taskId);
      if (!taskMatch) {
        res.status(404).json({ error: "未找到对应任务，请刷新后重试。" });
        return;
      }

      const targetTask = taskMatch.task;
      const existingFiles = Array.isArray(targetTask?.files) ? targetTask.files : [];
      if (existingFiles.length + normalizedFiles.length > ADMIN_CLASSROOM_COURSE_FILE_MAX_ITEMS) {
        res.status(400).json({
          error: `每个任务最多上传 ${ADMIN_CLASSROOM_COURSE_FILE_MAX_ITEMS} 个附件，请删除后再上传。`,
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const uploadedByAdminId = sanitizeId(req.authAdmin?._id, "");
      const newFileDocs = [];
      try {
        for (const file of normalizedFiles) {
          const uploaded = await uploadTeacherLessonFileToOss({
            lesson: targetLesson,
            lessonIndex,
            file,
          });
          const fileId = createAdminClassroomLessonFileId();
          newFileDocs.push({
            key: ADMIN_CONFIG_KEY,
            fileId,
            lessonId,
            taskId,
            fileName: sanitizeGroupChatFileName(uploaded.fileName || file.originalname || "任务附件.bin"),
            mimeType: sanitizeGroupChatFileMimeType(uploaded.mimeType || file.mimetype),
            size: sanitizeRuntimeInteger(
              uploaded.size,
              0,
              0,
              TEACHER_CLASSROOM_FILE_MAX_FILE_SIZE_BYTES,
            ),
            storageType: "oss",
            ossKey: sanitizeGroupChatOssObjectKey(uploaded.ossKey),
            ossBucket: sanitizeAliyunOssBucket(uploaded.ossBucket),
            ossRegion: sanitizeAliyunOssRegion(uploaded.ossRegion),
            fileUrl: sanitizeGroupChatHttpUrl(uploaded.fileUrl),
            binary: Buffer.alloc(0),
            uploadedByAdminId,
            uploadedAt: new Date(nowIso),
          });
        }
      } catch (error) {
        for (const uploadedDoc of newFileDocs) {
          const ossKey = sanitizeGroupChatOssObjectKey(uploadedDoc.ossKey);
          if (!ossKey) continue;
          await deleteGroupChatOssObject(ossKey).catch(() => {});
        }
        throw error;
      }

      if (newFileDocs.length === 0) {
        res.status(400).json({ error: "上传文件为空，请重新选择。" });
        return;
      }

      await AdminClassroomLessonFile.insertMany(newFileDocs, { ordered: true });

      const nextTaskFiles = sanitizeAdminClassroomCourseFilesPayload([
        ...existingFiles,
        ...newFileDocs.map((doc) => normalizeAdminClassroomLessonFileDoc(doc)),
      ]);

      const teacherCoursePlans = previous.teacherCoursePlans.map((lesson, index) => {
        if (index !== lessonIndex) return lesson;
        const tasks = Array.isArray(lesson?.tasks) ? lesson.tasks : [];
        const nextTasks = tasks.map((task) => {
          if (sanitizeId(task?.id, "") !== taskId) return task;
          return {
            ...task,
            files: nextTaskFiles,
          };
        });
        return {
          ...lesson,
          tasks: nextTasks,
          updatedAt: nowIso,
        };
      });

      const doc = await AdminConfig.findOneAndUpdate(
        { key: ADMIN_CONFIG_KEY },
        {
          $set: {
            key: ADMIN_CONFIG_KEY,
            teacherCoursePlans,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean();
      const config = normalizeAdminConfigDoc(doc);

      res.json({
        ok: true,
        lessonId,
        taskId,
        teacherCoursePlans: config.teacherCoursePlans,
        updatedAt: config.updatedAt,
      });
    },
  );

  app.delete(
    "/api/auth/admin/classroom-plans/:lessonId/files/:fileId",
    requireAdminAuth,
    async (req, res) => {
      const lessonId = sanitizeId(req.params.lessonId, "");
      const fileId = sanitizeId(req.params.fileId, "");
      if (!lessonId || !fileId) {
        res.status(400).json({ error: "文件标识无效。" });
        return;
      }

      const previous = await readAdminAgentConfig();
      const lessonIndex = previous.teacherCoursePlans.findIndex(
        (lesson) => sanitizeId(lesson?.id, "") === lessonId,
      );
      if (lessonIndex < 0) {
        res.status(404).json({ error: "未找到对应课时。" });
        return;
      }

      const targetLesson = previous.teacherCoursePlans[lessonIndex];
      const files = Array.isArray(targetLesson?.files) ? targetLesson.files : [];
      const nextFiles = files.filter((file) => sanitizeId(file?.id, "") !== fileId);
      if (nextFiles.length === files.length) {
        res.status(404).json({ error: "未找到对应课程文件。" });
        return;
      }

      const nowIso = new Date().toISOString();
      const teacherCoursePlans = previous.teacherCoursePlans.map((lesson, index) => {
        if (index !== lessonIndex) return lesson;
        return {
          ...lesson,
          files: nextFiles,
          updatedAt: nowIso,
        };
      });

      const removedDoc = await AdminClassroomLessonFile.findOneAndDelete({
        key: ADMIN_CONFIG_KEY,
        lessonId,
        fileId,
      }).lean();
      const removedOssKey = sanitizeGroupChatOssObjectKey(removedDoc?.ossKey);
      if (removedOssKey) {
        await deleteGroupChatOssObject(removedOssKey).catch(() => {});
      }

      const doc = await AdminConfig.findOneAndUpdate(
        { key: ADMIN_CONFIG_KEY },
        {
          $set: {
            key: ADMIN_CONFIG_KEY,
            teacherCoursePlans,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean();
      const config = normalizeAdminConfigDoc(doc);
      res.json({
        ok: true,
        lessonId,
        fileId,
        teacherCoursePlans: config.teacherCoursePlans,
        updatedAt: config.updatedAt,
      });
    },
  );

  app.delete(
    "/api/auth/admin/classroom-plans/:lessonId/tasks/:taskId/files/:fileId",
    requireAdminAuth,
    async (req, res) => {
      const lessonId = sanitizeId(req.params.lessonId, "");
      const taskId = sanitizeId(req.params.taskId, "");
      const fileId = sanitizeId(req.params.fileId, "");
      if (!lessonId || !taskId || !fileId) {
        res.status(400).json({ error: "附件标识无效。" });
        return;
      }

      const previous = await readAdminAgentConfig();
      const lessonIndex = previous.teacherCoursePlans.findIndex(
        (lesson) => sanitizeId(lesson?.id, "") === lessonId,
      );
      if (lessonIndex < 0) {
        res.status(404).json({ error: "未找到对应课时。" });
        return;
      }

      const targetLesson = previous.teacherCoursePlans[lessonIndex];
      const taskMatch = findAdminClassroomLessonTaskById(targetLesson, taskId);
      if (!taskMatch) {
        res.status(404).json({ error: "未找到对应任务。" });
        return;
      }

      const taskFiles = Array.isArray(taskMatch.task?.files) ? taskMatch.task.files : [];
      const nextTaskFiles = taskFiles.filter((file) => sanitizeId(file?.id, "") !== fileId);
      if (nextTaskFiles.length === taskFiles.length) {
        res.status(404).json({ error: "未找到对应任务附件。" });
        return;
      }

      const nowIso = new Date().toISOString();
      const teacherCoursePlans = previous.teacherCoursePlans.map((lesson, index) => {
        if (index !== lessonIndex) return lesson;
        const tasks = Array.isArray(lesson?.tasks) ? lesson.tasks : [];
        const nextTasks = tasks.map((task) => {
          if (sanitizeId(task?.id, "") !== taskId) return task;
          return {
            ...task,
            files: nextTaskFiles,
          };
        });
        return {
          ...lesson,
          tasks: nextTasks,
          updatedAt: nowIso,
        };
      });

      const removedDoc = await AdminClassroomLessonFile.findOneAndDelete({
        key: ADMIN_CONFIG_KEY,
        lessonId,
        taskId,
        fileId,
      }).lean();
      const removedOssKey = sanitizeGroupChatOssObjectKey(removedDoc?.ossKey);
      if (removedOssKey) {
        await deleteGroupChatOssObject(removedOssKey).catch(() => {});
      }

      const doc = await AdminConfig.findOneAndUpdate(
        { key: ADMIN_CONFIG_KEY },
        {
          $set: {
            key: ADMIN_CONFIG_KEY,
            teacherCoursePlans,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean();
      const config = normalizeAdminConfigDoc(doc);

      res.json({
        ok: true,
        lessonId,
        taskId,
        fileId,
        teacherCoursePlans: config.teacherCoursePlans,
        updatedAt: config.updatedAt,
      });
    },
  );

  app.get(
    "/api/auth/admin/classroom-plans/files/:fileId/download",
    requireAdminAuth,
    async (req, res) => {
      const fileId = sanitizeId(req.params.fileId, "");
      if (!fileId) {
        res.status(400).json({ error: "文件标识无效。" });
        return;
      }

      const config = await readAdminAgentConfig();
      const lessonMatch = findAdminClassroomLessonByFileId(config.teacherCoursePlans, fileId);
      if (!lessonMatch) {
        res.status(404).json({ error: "课程文件不存在或已被移除。" });
        return;
      }

      const fileDoc = await AdminClassroomLessonFile.findOne({
        key: ADMIN_CONFIG_KEY,
        lessonId: sanitizeId(lessonMatch.lesson?.id, ""),
        fileId,
      }).lean();
      if (!fileDoc) {
        res.status(404).json({ error: "文件数据不存在，请重新上传。" });
        return;
      }

      const fileKind = resolveClassroomFileKindByTask(lessonMatch.task);
      const fileLabel = getClassroomFileLabel(fileKind);
      const fileName = sanitizeGroupChatFileName(
        lessonMatch.file?.name ||
          fileDoc.fileName ||
          getClassroomFileFallbackName(fileKind),
      );
      const mimeType = sanitizeGroupChatFileMimeType(
        lessonMatch.file?.mimeType || fileDoc.mimeType,
      );
      const storageType = sanitizeGroupChatFileStorageType(fileDoc?.storageType);
      const ossKey = sanitizeGroupChatOssObjectKey(fileDoc?.ossKey);
      if (storageType === "oss" && ossKey) {
        const downloadUrl = await buildTeacherLessonFileDownloadUrl({
          ossKey,
          fileName,
        });
        if (downloadUrl) {
          res.json({
            ok: true,
            downloadUrl,
            fileName,
            mimeType,
          });
          return;
        }
        res.status(404).json({
          error: `${fileLabel}链接已失效，请教师重新上传。`,
        });
        return;
      }

      if (!Buffer.isBuffer(fileDoc.binary) || fileDoc.binary.length === 0) {
        res.status(404).json({ error: "文件数据不存在，请重新上传。" });
        return;
      }
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
      res.setHeader("Content-Length", String(fileDoc.binary.length));
      res.send(fileDoc.binary);
    },
  );

  app.get("/api/classroom/lessons/files/:fileId/download", requireChatAuth, async (req, res) => {
    const teacherScopeKey = sanitizeTeacherScopeKey(req.authTeacherScopeKey);
    if (teacherScopeKey !== SHANGGUAN_FUZE_TEACHER_SCOPE_KEY) {
      res.status(403).json({ error: "当前班级暂不支持下载该课程文件。" });
      return;
    }

    const fileId = sanitizeId(req.params.fileId, "");
    if (!fileId) {
      res.status(400).json({ error: "文件标识无效。" });
      return;
    }

    const config = await readAdminAgentConfig();
    const lessonMatch = findAdminClassroomLessonByFileId(config.teacherCoursePlans, fileId);
    if (!lessonMatch || !sanitizeRuntimeBoolean(lessonMatch.lesson?.enabled, true)) {
      res.status(404).json({ error: "课程文件不存在或暂未开放下载。" });
      return;
    }

    const lessonId = sanitizeId(lessonMatch.lesson?.id, "");
    const fileDoc = await AdminClassroomLessonFile.findOne({
      key: ADMIN_CONFIG_KEY,
      lessonId,
      fileId,
    }).lean();
    if (!fileDoc) {
      res.status(404).json({ error: "课程文件不存在或已失效。" });
      return;
    }

    const fileKind = resolveClassroomFileKindByTask(lessonMatch.task);
    const fileLabel = getClassroomFileLabel(fileKind);
    const fileName = sanitizeGroupChatFileName(
      lessonMatch.file?.name ||
        fileDoc.fileName ||
        getClassroomFileFallbackName(fileKind),
    );
    const mimeType = sanitizeGroupChatFileMimeType(lessonMatch.file?.mimeType || fileDoc.mimeType);
    const storageType = sanitizeGroupChatFileStorageType(fileDoc?.storageType);
    const ossKey = sanitizeGroupChatOssObjectKey(fileDoc?.ossKey);
    if (storageType === "oss" && ossKey) {
      const downloadUrl = await buildTeacherLessonFileDownloadUrl({
        ossKey,
        fileName,
      });
      if (!downloadUrl) {
        res.status(404).json({
          error: `${fileLabel}下载链接不可用，请稍后重试。`,
        });
        return;
      }
      res.json({
        ok: true,
        downloadUrl,
        fileName,
        mimeType,
      });
      return;
    }

    if (!Buffer.isBuffer(fileDoc.binary) || fileDoc.binary.length === 0) {
      res.status(404).json({ error: "课程文件不存在或已失效。" });
      return;
    }
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
    res.setHeader("Content-Length", String(fileDoc.binary.length));
    res.send(fileDoc.binary);
  });
}
