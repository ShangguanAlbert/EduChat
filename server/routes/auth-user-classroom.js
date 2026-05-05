import { normalizeChatBootstrapResponse } from "../../shared/contracts/chat.js";

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
    multer,
    dotenv,
    http,
    existsSync,
    mkdtemp,
    mkdir,
    readFileAsync,
    rm,
    writeFileAsync,
    path,
    tmpdir,
    crypto,
    execFile,
    promisify,
    mammoth,
    XLSX,
    PDFParse,
    mongoose,
    OSS,
    WebSocketServer,
    SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT,
    PROMPT_LEAK_PROBE_KEYWORDS,
    buildAliyunChatPayload,
    buildAliyunDashScopePayload,
    buildAliyunHeaders,
    buildAliyunProviderConfig,
    buildAliyunResponsesPayload,
    formatAliyunUpstreamError,
    pipeAliyunDashScopeSse,
    resolveAliyunModelPolicy,
    resolveAliyunProtocol,
    resolveAliyunWebSearchRuntime,
    shouldUseAliyunDashScopeMultimodalEndpoint,
    ALIYUN_SEARCH_CITATION_FORMATS,
    ALIYUN_SEARCH_FRESHNESS_OPTIONS,
    ALIYUN_SEARCH_STRATEGIES,
    DEFAULT_TEACHER_SCOPE_KEY,
    SHANGGUAN_FUZE_TEACHER_SCOPE_KEY,
    YANG_JUNFENG_TEACHER_SCOPE_KEY,
    buildTeacherScopedStorageUserId,
    getTeacherScopeLabel,
    isDefaultTeacherScopeKey,
    sanitizeTeacherScopeKey,
    FIXED_STUDENT_ACCOUNTS,
    FIXED_STUDENT_ACCOUNT_TAG,
    FIXED_STUDENT_REQUIRED_TEACHER_SCOPE_KEY,
    groupChatWsRoomSockets,
    groupChatWsMetaBySocket,
    groupChatWsOnlineCountsByRoom,
    userOnlinePresenceByUserId,
    chatPreparedAttachmentCache,
    groupChatExpiredFileCleanupTimer,
    generatedImageExpiredCleanupTimer,
    port,
    mongoUri,
    authSecret,
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
    GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER,
    GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER,
    GROUP_CHAT_MAX_MEMBERS_PER_ROOM,
    GROUP_CHAT_MAX_ROOMS_PER_BOOTSTRAP,
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
    groupChatOssClients,
    groupChatOssClient,
    groupChatOssFallbackClient,
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
    scryptAsync,
    execFileAsync,
    CRC32_TABLE,
    TEXT_EXTENSIONS,
    WORD_EXTENSIONS,
    EXCEL_EXTENSIONS,
    PDF_EXTENSIONS,
    VIDEO_EXTENSIONS,
    OPENROUTER_VIDEO_EXTENSIONS,
    OPENROUTER_AUDIO_FORMATS,
    OPENROUTER_AUDIO_EXTENSIONS,
    OPENROUTER_AUDIO_MIME_TO_FORMAT,
    upload,
    studentHomeworkUpload,
    teacherClassroomFileUpload,
    imageGenerationUpload,
    groupChatImageUpload,
    groupChatFileUpload,
    authUserSchema,
    AuthUser,
    chatStateSchema,
    ChatState,
    uploadedFileContextSchema,
    UploadedFileContext,
    generatedImageHistorySchema,
    GeneratedImageHistory,
    groupChatRoomReadStateSchema,
    groupChatRoomSchema,
    GroupChatRoom,
    groupChatMessageReactionSchema,
    groupChatStoredFileSchema,
    GroupChatStoredFile,
    groupChatMessageSchema,
    GroupChatMessage,
    runtimeConfigSchema,
    adminClassroomCourseFileSchema,
    adminClassroomTaskSchema,
    adminClassroomCoursePlanSchema,
    adminConfigSchema,
    AdminConfig,
    adminClassroomLessonFileSchema,
    AdminClassroomLessonFile,
    classroomHomeworkFileSchema,
    ClassroomHomeworkFile,
    getDefaultRuntimeConfigByAgent,
    createDefaultAgentRuntimeConfigMap,
    normalizeMessages,
    normalizeMessageContent,
    hasUsableMessageContent,
    hasImageInputInMessages,
    messageContainsImageInput,
    isImageUploadFile,
    cloneNormalizedMessageContent,
    resolveUploadedFileContextIdentity,
    buildUploadedFileContextExpireAt,
    sanitizeUploadedFileContextOssSource,
    normalizeUploadedFileContextOssFiles,
    resolveUploadedContextOssFileForInputFile,
    dedupeUploadedFileContextOssFiles,
    buildUploadedAttachmentLinksForClient,
    saveUploadedFileContext,
    pruneUploadedFileContextsForSession,
    extractTextPartsForAliyunContext,
    buildAliyunDashScopeMediaPartsFromOssFiles,
    buildAliyunDashScopeRehydratedContent,
    rehydrateUploadedFileContexts,
    sanitizeVolcengineFileRefsPayload,
    sanitizePreparedAttachmentRefsPayload,
    sanitizePreparedAttachmentTokens,
    pruneExpiredChatPreparedAttachmentCache,
    trimChatPreparedAttachmentCache,
    createChatPreparedAttachmentToken,
    savePreparedAttachmentToCache,
    resolvePreparedAttachmentRefsFromCache,
    attachVolcengineFileRefsToLatestUserMessage,
    attachPreparedAttachmentPartsToLatestUserMessage,
    attachFilesToLatestUserMessage,
    stripAliyunDocumentUrlPartsFromMessages,
    isAliyunDashScopeUnsupportedNativeFileErrorText,
    resolveLatestUserMessage,
    buildInitialAttachmentParts,
    buildDataUrlForBuffer,
    resolveOpenRouterAudioFormat,
    resolveOpenRouterVideoMime,
    buildOpenRouterFileInputPart,
    resolveAliyunVideoMime,
    resolveAliyunDashScopeAttachmentUrl,
    buildAliyunDashScopeDocumentUrlPart,
    shouldForceAliyunDashScopeLocalParseForFile,
    renderPdfToAliyunDashScopeImagesWithPython,
    buildAliyunDashScopePdfImageParts,
    buildAliyunDashScopeFileInputParts,
    buildParsedFilePreviewTextPart,
    attachFilesToLatestUserMessageForOpenRouter,
    attachFilesToLatestUserMessageForAliyunDashScope,
    attachFilesToLatestUserMessageByLocalParsing,
    streamAgentResponse,
    streamSeedreamImageGeneration,
    buildSeedreamImageGenerationRequest,
    normalizeSeedreamGenerationModel,
    normalizeSeedreamSize,
    normalizeSeedreamSequentialMode,
    normalizeSeedreamResponseFormat,
    parseSeedreamImageInputs,
    isSeedreamImageInputUrl,
    buildSeedreamFileImageInputs,
    normalizeSeedreamImageMimeType,
    extractSeedreamImageResultEntries,
    pipeVolcengineImageGenerationSse,
    emitSeedreamImageGenerationNonStreamEvents,
    buildGeneratedImageHistoryExpireAt,
    normalizeGeneratedImageHistoryResponseFormat,
    normalizeGeneratedImageStoreUrl,
    normalizeGeneratedImageStorageType,
    normalizeGeneratedImageMimeType,
    extractGeneratedImageDataBuffer,
    parseGeneratedImageDataUrl,
    buildGeneratedImageHistoryContentPath,
    buildAdminGeneratedImageHistoryContentPath,
    parseTeacherScopedStorageUserId,
    resolveGeneratedImageOutputUrl,
    fetchGeneratedImageBinaryFromUrl,
    buildGeneratedImageBinaryPayload,
    saveGeneratedImageHistory,
    toGeneratedImageHistoryItem,
    toAdminGeneratedImageHistoryItem,
    sanitizeImageGenerationUsage,
    mapVolcengineImageGenerationEventError,
    buildImageGenerationHeaders,
    getVolcengineImageGenerationConfig,
    buildChatRequestPayload,
    buildOpenRouterPlugins,
    buildResponsesRequestPayload,
    resolveProviderWebSearchRuntime,
    resolveVolcengineWebSearchRuntime,
    buildWebSearchToolFromRuntimeConfig,
    resolveVolcengineWebSearchCapability,
    findVolcengineWebSearchCapabilityByModel,
    getNormalizedModelCandidates,
    readModelAllowlistFromEnv,
    matchModelCandidates,
    resolveRuntimeTokenProfileByModel,
    isVolcengineFixedSamplingModel,
    buildResponsesInputItems,
    normalizeResponsesMessageContent,
    keepVolcengineResponsesFileRefsOnly,
    extractInputImageUrl,
    extractInputVideoUrl,
    extractAliyunFileUrl,
    normalizeOpenRouterFilePart,
    normalizeOpenRouterAudioPart,
    mapReasoningEffortToResponses,
    supportsVolcengineResponsesReasoningEffort,
    resolveRequestProtocol,
    extractSmartContextIncrementalMessages,
    isPromptLeakProbeRequest,
    extractMessagePlainText,
    resolveSmartContextRuntime,
    readSessionContextRef,
    saveSessionContextRef,
    clearSessionContextRef,
    shouldResetSmartContextReference,
    pickRecentUserRounds,
    parseFileContent,
    classifyVolcengineFileInputType,
    normalizeMultipartUploadFile,
    uploadVolcengineMultipartFilesAsRefs,
    uploadVolcengineFileAndWaitActive,
    waitForVolcengineFileActive,
    retrieveVolcengineFileMeta,
    sleepMs,
    getFileExtension,
    normalizeMultipartFileName,
    isWordFile,
    isExcelFile,
    isPdfFile,
    isTextLikeFile,
    isProbablyBinary,
    decodeTextFile,
    parseDocx,
    parseExcel,
    normalizeRow,
    parsePdf,
    clipText,
    pipeOpenRouterSse,
    pipeResponsesSse,
    extractResponsesOutputTextFromCompleted,
    extractResponsesReasoningTextFromCompleted,
    extractResponsesTokenUsage,
    extractResponsesWebSearchUsage,
    extractNamedToolUsageCount,
    extractNamedToolUsageDetails,
    normalizeUsageCount,
    sumNumericUsage,
    sanitizeUsageCountNumber,
    formatWebSearchUsageText,
    extractResponsesErrorMessage,
    extractOpenRouterStreamErrorMessage,
    extractDeltaText,
    extractSseDataPayload,
    findSseEventBoundary,
    writeEvent,
    safeReadText,
    safeReadJson,
    getModelByAgent,
    getSystemPromptByAgent,
    getResolvedAgentRuntimeConfig,
    getDefaultSystemPrompt,
    readAdminAgentConfig,
    sanitizeAdminClassroomTaskType,
    sanitizeAdminClassroomTaskPayload,
    sanitizeAdminClassroomCourseFilePayload,
    sanitizeAdminClassroomCourseFilesPayload,
    normalizeAdminClassroomLessonDateTimeInput,
    parseAdminClassroomLegacyCourseTimeRange,
    buildAdminClassroomCourseTimeText,
    sortAdminClassroomCoursePlans,
    sanitizeAdminClassroomCoursePlanPayload,
    sanitizeAdminClassroomCoursePlansPayload,
    sanitizeAdminClassroomDisciplineConfigPayload,
    sanitizeAdminClassroomSeatLayoutPayload,
    sanitizeAdminClassroomSeatLayoutsByClassPayload,
    createAdminClassroomLessonFileId,
    createClassroomHomeworkFileId,
    normalizeAdminClassroomLessonFileDoc,
    normalizeClassroomHomeworkFileDoc,
    compareClassroomRosterStudent,
    iterateAdminClassroomTaskFiles,
    collectAdminClassroomFileIdsFromLesson,
    findAdminClassroomLessonTaskById,
    findAdminClassroomLessonByFileId,
    normalizeAdminConfigDoc,
    sanitizeAgentPromptPayload,
    resolveAgentSystemPrompts,
    sanitizeAgentRuntimeConfigsPayload,
    sanitizeSingleAgentRuntimeConfig,
    resolveAgentRuntimeConfigs,
    normalizeRuntimeConfigFromPreset,
    getRuntimePresetDefaults,
    sanitizeRuntimeProtocol,
    sanitizeRuntimeProvider,
    sanitizeRuntimeModel,
    sanitizeOpenRouterPreset,
    sanitizeOpenRouterWebPluginEngine,
    sanitizeOpenRouterPdfEngine,
    sanitizeAliyunSearchStrategy,
    sanitizeAliyunSearchCitationFormat,
    sanitizeAliyunSearchFreshness,
    sanitizeAliyunAssignedSiteList,
    normalizeAliyunAssignedSite,
    sanitizeAliyunPromptIntervene,
    sanitizeAliyunFileProcessMode,
    sanitizeEnableThinking,
    sanitizeCreativityMode,
    sanitizeRuntimeNumber,
    sanitizeRuntimeInteger,
    sanitizeRuntimeBoolean,
    sanitizeReasoningEffort,
    sanitizeSmartContextMode,
    buildAdminAgentSettingsResponse,
    buildAgentProviderDefaults,
    buildAgentModelDefaults,
    sanitizeSystemPrompt,
    getProviderByAgent,
    resolveReasoningPolicy,
    modelSupportsReasoning,
    modelRequiresReasoning,
    providerSupportsReasoning,
    normalizeProvider,
    getProviderConfig,
    readEnvApiKey,
    isPlaceholderApiKey,
    buildProviderHeaders,
    extractRequestFailureCode,
    isRetryableRequestFailure,
    formatProviderRequestFailure,
    sendProviderRequestWithRetry,
    formatProviderUpstreamError,
    parseUpstreamErrorDetail,
    mapVolcengineUpstreamError,
    pruneExpiredUserOnlinePresence,
    markUserOnlinePresence,
    markUserOnlineBrowserHeartbeat,
    setUserOnlineSocketPresence,
    collectOnlinePresenceEntries,
    requireChatAuth,
    resolveImageHistoryAuthUserId,
    requireAdminAuth,
    readJsonLikeField,
    readRequestMessages,
    readRequestVolcengineFileRefs,
    readRequestPreparedAttachmentRefs,
    defaultChatState,
    readChatStateShape,
    readTeacherScopedChatStateRaw,
    normalizeChatStateDoc,
    getTeacherScopedChatStatePath,
    readTeacherScopedSessionContextRefs,
    createChatSessionId,
    migrateLegacyChatStateSessionIds,
    sanitizeChatStatePayload,
    sanitizeChatStateMetaPayload,
    mergeSanitizedChatMessageLists,
    mergeChatStateSessionMessagesPreservingCompleteness,
    sanitizeSessionMessageUpsertsPayload,
    sanitizeSmartContextMapAgentId,
    buildSmartContextEnabledMapKey,
    sanitizeSmartContextEnabledBySessionAgent,
    sanitizeAgentBySession,
    sanitizeStateSettings,
    sanitizeGroups,
    sanitizeSessions,
    sanitizeSessionMessages,
    sanitizeMessage,
    resolveActiveId,
    sanitizeUserProfile,
    validateUserProfile,
    isUserProfileComplete,
    sanitizeId,
    sanitizePreparedAttachmentToken,
    sanitizeText,
    sanitizeIsoDate,
    sanitizeAgent,
    resolveTeacherScopedLockedAgentId,
    sanitizeReasoning,
    sanitizeNumber,
    sanitizeGroupChatRoomName,
    sanitizeGroupChatText,
    sanitizeGroupChatCode,
    sanitizeGroupChatAfterDate,
    buildGroupChatDisplayName,
    createGroupChatRoomCodeCandidate,
    generateUniqueGroupChatRoomCode,
    sanitizeGroupChatMemberUserIds,
    sanitizeGroupChatMutedMemberUserIds,
    normalizeGroupChatReadStates,
    getGroupChatOnlineUserIdsByRoom,
    normalizeGroupChatRoomDoc,
    isGroupChatMemberMuted,
    normalizeGroupChatFilesApiInputType,
    normalizeGroupChatFilesApiStatus,
    normalizeGroupChatFilesApiMeta,
    normalizeGroupChatFileOssMeta,
    isGroupChatFilesApiExpired,
    resolveGroupChatFileExtension,
    classifyGroupChatVolcengineSupportedInputType,
    normalizeGroupChatRoomFileItemFromMessageDoc,
    normalizeGroupChatMessageDoc,
    sanitizeGroupChatImageFileName,
    sanitizeGroupChatFileName,
    buildAttachmentContentDisposition,
    toAsciiHeaderFileName,
    encodeRfc5987ValueChars,
    sanitizeGroupChatFileMimeType,
    normalizeGroupChatUploadedFileName,
    decodeGroupChatMaybeUriComponent,
    decodeGroupChatMaybeRfc2047,
    decodeGroupChatLatin1ToUtf8,
    looksLikeGroupChatMojibake,
    scoreGroupChatFileNameCandidate,
    buildGroupChatFileExpireAt,
    sanitizeAliyunOssNetworkMode,
    resolveAliyunOssNetworkMode,
    buildGroupChatOssConfig,
    createGroupChatOssClient,
    createGroupChatOssClients,
    isGroupChatOssConnectionTimeoutError,
    isGroupChatOssAccessDeniedError,
    callGroupChatOssWithTimeoutFallback,
    sanitizeAliyunOssBucket,
    sanitizeAliyunOssRegion,
    sanitizeAliyunOssEndpoint,
    sanitizeAliyunOssObjectPrefix,
    sanitizeGroupChatFileStorageType,
    sanitizeGroupChatOssObjectKey,
    sanitizeGroupChatHttpUrl,
    resolveGroupChatOssBucketHost,
    normalizeGroupChatOssPublicEndpoint,
    encodeGroupChatOssObjectKeyPath,
    buildGroupChatOssObjectKey,
    sanitizeGroupChatOssScopeSegment,
    resolveFileExtensionByMimeType,
    buildRuntimeOssObjectKey,
    formatTeacherLessonOssTimeSegment,
    buildTeacherLessonOssLessonSegment,
    sanitizeStudentHomeworkOssFolderSegment,
    buildStudentHomeworkLessonFolderName,
    buildStudentHomeworkStudentFolderName,
    buildStudentHomeworkOssObjectKey,
    uploadTeacherLessonFileToOss,
    uploadStudentHomeworkFileToOss,
    uploadBufferToGroupChatOss,
    sanitizeChatAttachmentOssSource,
    uploadChatAttachmentsToOss,
    backupChatAttachmentsToOssInBackground,
    buildGroupChatOssObjectUrl,
    buildGroupChatFileSignedDownloadUrl,
    buildTeacherLessonFileDownloadUrl,
    buildGroupChatStoredFileStoragePayload,
    deleteGroupChatOssObject,
    readGroupChatOssStartupCheckConfig,
    buildGroupChatOssStartupProbeObjectKey,
    formatGroupChatOssError,
    runGroupChatOssStartupHealthCheck,
    deleteGroupChatStoredFileObjects,
    deleteGeneratedImageHistoryOssObjects,
    isGroupChatOssNotFoundError,
    findGroupChatStoredFileByRoomAndId,
    cleanupExpiredGroupChatStoredFiles,
    startGroupChatExpiredFileCleanupTask,
    cleanupExpiredGeneratedImageHistories,
    startGeneratedImageExpiredCleanupTask,
    migrateOssFilesToPermanentRetention,
    sanitizeGroupChatReactionEmoji,
    normalizeGroupChatReactions,
    toGroupChatDateTimestamp,
    collectGroupChatMemberUserIds,
    readGroupChatUsersByIds,
    createGroupChatSystemMessage,
    collectMentionNames,
    resolveGroupChatReplyMeta,
    buildGroupChatReadStateMap,
    buildGroupChatRoomReadStatesFromMap,
    updateGroupChatRoomReadState,
    markGroupChatRoomReadByMessageId,
    isMongoObjectIdLike,
    initGroupChatWebSocketServer,
    handleGroupChatWsMessage,
    handleGroupChatWsAuth,
    handleGroupChatWsJoinRoom,
    handleGroupChatWsLeaveRoom,
    readGroupChatWsPayload,
    sendGroupChatWsPayload,
    sendGroupChatWsError,
    closeGroupChatSocket,
    attachSocketToGroupChatRoom,
    detachSocketFromGroupChatRoom,
    detachSocketFromAllGroupChatRooms,
    clearGroupChatRoomSockets,
    broadcastGroupChatWsPayload,
    sendGroupChatWsPayloadToUserInRoom,
    broadcastGroupChatMemberPresenceUpdated,
    broadcastGroupChatRoomReadStateUpdated,
    broadcastGroupChatMessageCreated,
    broadcastGroupChatMessageReactionsUpdated,
    broadcastGroupChatMessageDeleted,
    broadcastGroupChatRoomUpdated,
    assertPartyAgentPanelRoomAccess,
    broadcastGroupChatRoomDissolved,
    broadcastGroupChatMemberJoined,
    startServer,
    runStartupMaintenanceTasks,
    ensureUploadedFileContextIndexes,
    ensureGeneratedImageHistoryIndexes,
    ensureGroupChatStoredFileIndexes,
    hasEquivalentMongoIndex,
    hasSameMongoIndexKey,
    readCollectionIndexesSafe,
    isMongoNamespaceMissingError,
    ensureUploadedFileContextTtlIndex,
    ensureGeneratedImageHistoryTtlIndex,
    ensureGroupChatStoredFileTtlIndex,
    findMongoIndexByKey,
    normalizeUsername,
    toUsernameKey,
    isReservedAdminUsernameKey,
    isFixedAdminUsernameKey,
    isFixedAdminUser,
    isFixedStudentUsernameKey,
    isFixedStudentUser,
    readLockedTeacherScopeKey,
    isJiaoji231ClassName,
    resolveLoginLockedTeacherScopeKey,
    validatePassword,
    hashPassword,
    verifyPassword,
    ensureFixedAdminAccounts,
    ensureFixedStudentAccounts,
    signToken,
    verifyToken,
    readBearerToken,
    authenticateAdminRequest,
    authenticateAdminRequestFromHeaderOrQuery,
    buildAdminUsersExportTxt,
    buildAdminChatsExportTxt,
    buildSingleUserChatExportTxt,
    appendUserChatSection,
    appendIndentedBlock,
    formatDisplayTime,
    formatSystemDateYmd,
    formatFileStamp,
    normalizeExportRole,
    normalizeFeedbackLabel,
    formatMaybeNumber,
    buildZipReadme,
    sanitizeZipFileNamePart,
    buildZipBuffer,
    sanitizeZipEntryName,
    toDosDateTime,
    crc32Buffer,
    createCrc32Table,
    toPublicUser,
  } = deps;

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const CLASSROOM_TARGET_CLASS_NAMES = Object.freeze(["810班", "811班"]);
  const CLASSROOM_DEFAULT_TARGET_CLASS_NAME = CLASSROOM_TARGET_CLASS_NAMES[0];

  function sanitizeClassroomTargetClassName(value, fallback = CLASSROOM_DEFAULT_TARGET_CLASS_NAME) {
    const className = sanitizeText(value, "", 40).replace(/\s+/g, "");
    if (CLASSROOM_TARGET_CLASS_NAMES.includes(className)) return className;
    return sanitizeText(fallback, CLASSROOM_DEFAULT_TARGET_CLASS_NAME, 40).replace(/\s+/g, "");
  }

  function sanitizeClassroomUserClassName(value) {
    const className = sanitizeText(value, "", 40).replace(/\s+/g, "");
    if (!className) return "";
    return CLASSROOM_TARGET_CLASS_NAMES.includes(className) ? className : "";
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
    const totalUsers = await AuthUser.countDocuments({ role: "user" });

    res.json({
      ok: true,
      hasAnyUser: totalUsers > 0,
      hasAdmin: FIXED_ADMIN_ACCOUNTS.length > 0,
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
    const userClassName = sanitizeSeatLayoutClassName(userProfile.className);
    let productImprovementEnabled = false;
    let teacherCoursePlans = [];
    let seatLayout = null;

    if (isShangguanTeacher) {
      const config = await readAdminAgentConfig();
      productImprovementEnabled = !!config.shangguanClassTaskProductImprovementEnabled;
      teacherCoursePlans = sortAdminClassroomCoursePlans(
        config.teacherCoursePlans
          .filter((lesson) => sanitizeRuntimeBoolean(lesson?.enabled, true))
          .map((lesson) => ({
            ...lesson,
            className: resolveClassroomLessonClassName(lesson),
          })),
      );
      seatLayout = buildSeatLayoutResponseForUser(
        normalizeSeatLayoutsByClassFromConfig(config),
        userClassName,
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
      teacherCoursePlans,
      seatLayout,
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
    const lessons = config.teacherCoursePlans
      .filter(
        (lesson) =>
          sanitizeRuntimeBoolean(lesson?.enabled, true),
      )
      .map((lesson) => ({
        id: sanitizeId(lesson?.id, ""),
        courseName: sanitizeText(lesson?.courseName, "", 80),
        className: resolveClassroomLessonClassName(lesson),
        courseStartAt: sanitizeIsoDate(lesson?.courseStartAt) || "",
        courseEndAt: sanitizeIsoDate(lesson?.courseEndAt) || "",
        courseTime: sanitizeText(lesson?.courseTime, "", 120),
        homeworkUploadEnabled: true,
        enabled: sanitizeRuntimeBoolean(lesson?.enabled, true),
      }))
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

  app.post("/api/auth/register", async (req, res) => {
    const password = String(req.body?.password || "");
    const usernameInput = String(req.body?.username || "");
    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const username = normalizeUsername(usernameInput);

    if (!username) {
      res.status(400).json({ error: "请输入用户名。" });
      return;
    }

    const usernameKey = toUsernameKey(username);
    if (isReservedAdminUsernameKey(usernameKey)) {
      res.status(400).json({ error: "该用户名为管理员保留账号，请使用其他用户名。" });
      return;
    }

    const existing = await AuthUser.findOne({ usernameKey }).lean();
    if (existing) {
      res.status(409).json({ error: "该账号已存在，请更换用户名。" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await AuthUser.create({
      username,
      usernameKey,
      role: "user",
      passwordHash,
      passwordPlain: password,
    });

    res.status(201).json({
      ok: true,
      user: toPublicUser(user),
    });
  });

  app.get("/api/auth/login/teacher-scope-lock", async (req, res) => {
    const username = normalizeUsername(req.query?.username);
    if (!username) {
      res.json({
        ok: true,
        lockedTeacherScopeKey: "",
        teacherScopeLabel: "",
      });
      return;
    }

    const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) }).lean();
    if (!user) {
      res.json({
        ok: true,
        lockedTeacherScopeKey: "",
        teacherScopeLabel: "",
      });
      return;
    }

    const lockedTeacherScopeKey = resolveLoginLockedTeacherScopeKey(user);
    res.json({
      ok: true,
      lockedTeacherScopeKey,
      teacherScopeLabel: lockedTeacherScopeKey ? getTeacherScopeLabel(lockedTeacherScopeKey) : "",
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const teacherScopeKey = sanitizeTeacherScopeKey(req.body?.teacherScopeKey);
    if (!username || !password) {
      res.status(400).json({ error: "请输入账号和密码。" });
      return;
    }

    const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) });
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !valid) {
      res.status(401).json({ error: "账号或密码错误。" });
      return;
    }

    const lockedTeacherScopeKey = resolveLoginLockedTeacherScopeKey(user);
    const effectiveTeacherScopeKey = lockedTeacherScopeKey || teacherScopeKey;

    const token = signToken(
      {
        uid: String(user._id),
        role: user.role,
        scope: "chat",
        tkey: effectiveTeacherScopeKey,
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

  app.post("/api/auth/forgot/verify", async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    if (!username) {
      res.status(400).json({ error: "请输入账号。" });
      return;
    }

    if (isReservedAdminUsernameKey(toUsernameKey(username))) {
      res.json({
        ok: true,
        exists: false,
        username: "",
      });
      return;
    }

    const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) }).lean();
    if (isFixedStudentUser(user)) {
      res.status(403).json({
        error: "该学生账号为系统预置账号，不支持在此重置密码，请使用学号作为密码登录。",
      });
      return;
    }

    res.json({
      ok: true,
      exists: !!user,
      username: user?.username || "",
    });
  });

  app.post("/api/auth/forgot/reset", async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!username) {
      res.status(400).json({ error: "请输入账号。" });
      return;
    }

    if (isReservedAdminUsernameKey(toUsernameKey(username))) {
      res.status(403).json({ error: "管理员账号为固定分配，不支持在此重置密码。" });
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "两次输入的新密码不一致。" });
      return;
    }

    const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) });
    if (!user) {
      res.status(404).json({ error: "未找到该账号。" });
      return;
    }

    if (isFixedStudentUser(user)) {
      res.status(403).json({
        error: "该学生账号为系统预置账号，不支持在此重置密码，请使用学号作为密码登录。",
      });
      return;
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordPlain = newPassword;
    await user.save();

    res.json({ ok: true, message: "密码已重置。" });
  });

  app.post("/api/auth/admin/login", async (req, res) => {
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
    const isAdmin = isFixedAdminUser(user);

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

    const teacherScopeKey = sanitizeTeacherScopeKey(
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
      updatedAt: config.updatedAt,
    });
  });

  app.get("/api/auth/admin/classroom-plans", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    const config = await readAdminAgentConfig();

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
      classroomDisciplineConfig: config.classroomDisciplineConfig,
      seatLayoutsByClass: normalizeSeatLayoutsByClassFromConfig(config),
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

    const [rosterUsers, homeworkDocs] = await Promise.all([
      AuthUser.find(
        {
          role: "user",
          lockedTeacherScopeKey: teacherScopeKey,
        },
        { username: 1, profile: 1, accountTag: 1 },
      ).lean(),
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
    const userClassByUserId = new Map(rosterAll.map((student) => [student.userId, student.className]));
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
        enabled: sanitizeRuntimeBoolean(lesson?.enabled, true),
        homeworkUploadEnabled: true,
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
          .replace(/[\u0000-\u001f\u007f]/g, "")
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
    const previous = await readAdminAgentConfig();
    const previousSeatLayoutsByClass = normalizeSeatLayoutsByClassFromConfig(previous);
    const rawPlans = sanitizeAdminClassroomCoursePlansPayload(req.body?.teacherCoursePlans);
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

      const fileName = sanitizeGroupChatFileName(
        lessonMatch.file?.name || fileDoc.fileName || "课程文件.bin",
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
        res.status(404).json({ error: "课程文件链接已失效，请教师重新上传。" });
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

    const fileName = sanitizeGroupChatFileName(
      lessonMatch.file?.name || fileDoc.fileName || "课程文件.bin",
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
        res.status(404).json({ error: "课程文件下载链接不可用，请稍后重试。" });
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
