export function registerAdminRoutes(app, deps) {
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
    AGENT_E_CONFIG_KEY,
    AGENT_E_FIXED_PROVIDER,
    AGENT_E_ID,
    buildAgentEAdminSettingsResponse,
    createAgentEConfigModel,
    normalizeAgentEConfigDoc,
    sanitizeAgentEConfigPayload,
    sanitizeAgentERuntime,
    selectAgentESkills,
    buildAgentESystemPrompt,
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
    AgentEConfig,
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
    streamAgentEResponse,
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
    readAgentEConfig,
    writeAgentEConfig,
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
    sanitizeChatStatePayload,
    sanitizeChatStateMetaPayload,
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

  const TERMINAL_ADMIN_USERNAME_KEY = toUsernameKey("上官福泽");
  const USER_DIRECTORY_DEFAULT_TARGET_CLASSES = Object.freeze(["教技231", "810班", "811班"]);
  const USER_DIRECTORY_DEFAULT_TARGET_CLASS_KEYS = new Set(
    USER_DIRECTORY_DEFAULT_TARGET_CLASSES.map((name) =>
      String(name || "")
        .trim()
        .replace(/\s+/g, ""),
    ),
  );
  const userDirectoryClassCategorySchema = new mongoose.Schema(
    {
      key: { type: String, default: ADMIN_CONFIG_KEY, unique: true, index: true },
      classNames: { type: [String], default: () => [] },
    },
    {
      timestamps: true,
      collection: "admin_user_directory_class_categories",
    },
  );
  const UserDirectoryClassCategory =
    mongoose.models.AdminUserDirectoryClassCategory ||
    mongoose.model("AdminUserDirectoryClassCategory", userDirectoryClassCategorySchema);

  function isTerminalAdminAccount(admin) {
    return toUsernameKey(admin?.username) === TERMINAL_ADMIN_USERNAME_KEY;
  }

  function normalizeClassNameKey(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "");
  }

  function sanitizeUserDirectoryTargetClasses(classNames) {
    const source = Array.isArray(classNames) ? classNames : [];
    const result = [];
    const seen = new Set();
    source.forEach((item) => {
      const name = sanitizeText(item, "", 40);
      const key = normalizeClassNameKey(name);
      if (!name || !key || seen.has(key)) return;
      seen.add(key);
      result.push(name);
    });
    return result;
  }

  function mergeDefaultUserDirectoryTargetClasses(classNames) {
    const custom = sanitizeUserDirectoryTargetClasses(classNames);
    const merged = [];
    const seen = new Set();
    [...USER_DIRECTORY_DEFAULT_TARGET_CLASSES, ...custom].forEach((item) => {
      const name = sanitizeText(item, "", 40);
      const key = normalizeClassNameKey(name);
      if (!name || !key || seen.has(key)) return;
      seen.add(key);
      merged.push(name);
    });
    return merged;
  }

  async function readUserDirectoryTargetClasses() {
    const doc = await UserDirectoryClassCategory.findOne({ key: ADMIN_CONFIG_KEY }).lean();
    return mergeDefaultUserDirectoryTargetClasses(doc?.classNames);
  }

  function resolveUserDirectoryClassBucket(className, targetClassKeys = USER_DIRECTORY_DEFAULT_TARGET_CLASS_KEYS) {
    const normalized = normalizeClassNameKey(className);
    if (!normalized) return "unassigned";
    if (targetClassKeys.has(normalized)) return "target";
    return "other";
  }

  function buildUserDirectoryItem(user, targetClassKeys = USER_DIRECTORY_DEFAULT_TARGET_CLASS_KEYS) {
    const profile = sanitizeUserProfile(user?.profile);
    const role = sanitizeText(user?.role, "user", 20) || "user";
    return {
      id: sanitizeId(user?._id, ""),
      username: sanitizeText(user?.username, "", 64),
      usernameKey: toUsernameKey(user?.username || user?.usernameKey),
      role,
      accountTag: sanitizeText(user?.accountTag, "", 40),
      lockedTeacherScopeKey: readLockedTeacherScopeKey(user?.lockedTeacherScopeKey),
      profile: {
        name: sanitizeText(profile?.name, "", 20),
        studentId: sanitizeText(profile?.studentId, "", 20),
        gender: sanitizeText(profile?.gender, "", 12),
        grade: sanitizeText(profile?.grade, "", 20),
        className: sanitizeText(profile?.className, "", 40),
      },
      classBucket: resolveUserDirectoryClassBucket(profile?.className, targetClassKeys),
      createdAt: sanitizeIsoDate(user?.createdAt),
      updatedAt: sanitizeIsoDate(user?.updatedAt),
    };
  }

  function escapeRegexForQuery(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildScopedUserIdRegex(baseUserId) {
    const safeUserId = sanitizeId(baseUserId, "");
    if (!safeUserId) return null;
    return new RegExp(`^${escapeRegexForQuery(safeUserId)}(?:__teacher__.+)?$`);
  }

  function remapTeacherScopedStorageUserId(storageUserId, fromUserId, toUserId) {
    const fromId = sanitizeId(fromUserId, "");
    const toId = sanitizeId(toUserId, "");
    if (!fromId || !toId) return "";
    const parsed = parseTeacherScopedStorageUserId(storageUserId);
    if (parsed.baseUserId !== fromId) return "";
    return buildTeacherScopedStorageUserId(toId, parsed.teacherScopeKey);
  }

  async function remapCollectionStorageUserIds(Model, fromUserId, toUserId) {
    const scopedRegex = buildScopedUserIdRegex(fromUserId);
    if (!scopedRegex) return 0;
    const docs = await Model.find({ userId: scopedRegex }, { _id: 1, userId: 1 }).lean();
    if (!Array.isArray(docs) || docs.length === 0) return 0;
    const ops = docs
      .map((doc) => {
        const nextUserId = remapTeacherScopedStorageUserId(doc?.userId, fromUserId, toUserId);
        if (!nextUserId) return null;
        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { userId: nextUserId } },
          },
        };
      })
      .filter(Boolean);
    if (ops.length === 0) return 0;
    await Model.bulkWrite(ops, { ordered: false });
    return ops.length;
  }

  async function deleteCollectionStorageUserIds(Model, baseUserId) {
    const scopedRegex = buildScopedUserIdRegex(baseUserId);
    if (!scopedRegex) return 0;
    const result = await Model.deleteMany({ userId: scopedRegex });
    return Number(result?.deletedCount || 0);
  }

  function remapGroupChatRoomStateUsers(room, fromUserId, toUserId) {
    const source = room && typeof room === "object" ? room : {};
    const fromId = sanitizeId(fromUserId, "");
    const toId = sanitizeId(toUserId, "");
    if (!fromId || fromId === toId) return null;

    let ownerUserId = sanitizeId(source?.ownerUserId, "");
    if (ownerUserId === fromId) ownerUserId = toId || "";

    const memberUserIds = sanitizeGroupChatMemberUserIds(source?.memberUserIds)
      .map((userId) => (userId === fromId ? toId : userId))
      .filter(Boolean);
    const memberSet = new Set(memberUserIds.filter(Boolean));
    if (ownerUserId) {
      memberSet.add(ownerUserId);
    }
    const dedupedMemberUserIds = Array.from(memberSet);
    if (dedupedMemberUserIds.length === 0) return null;
    if (!ownerUserId || !memberSet.has(ownerUserId)) {
      ownerUserId = dedupedMemberUserIds[0];
    }

    const mutedMemberUserIds = sanitizeGroupChatMutedMemberUserIds(
      (Array.isArray(source?.mutedMemberUserIds) ? source.mutedMemberUserIds : []).map((userId) =>
        sanitizeId(userId, "") === fromId ? toId : userId,
      ),
      dedupedMemberUserIds,
      ownerUserId,
    );

    const readStateMap = new Map();
    (Array.isArray(source?.readStates) ? source.readStates : []).forEach((state) => {
      const nextUserId = sanitizeId(state?.userId, "") === fromId ? toId : sanitizeId(state?.userId, "");
      if (!nextUserId || !memberSet.has(nextUserId)) return;
      const current = readStateMap.get(nextUserId);
      const currentTime = Date.parse(String(current?.updatedAt || current?.lastReadAt || "")) || 0;
      const nextTime = Date.parse(String(state?.updatedAt || state?.lastReadAt || "")) || 0;
      if (!current || nextTime >= currentTime) {
        readStateMap.set(nextUserId, {
          userId: nextUserId,
          lastReadMessageId: sanitizeId(state?.lastReadMessageId, ""),
          lastReadAt: sanitizeIsoDate(state?.lastReadAt),
          updatedAt: sanitizeIsoDate(state?.updatedAt || state?.lastReadAt) || new Date().toISOString(),
        });
      }
    });
    const readStates = normalizeGroupChatReadStates(Array.from(readStateMap.values()), dedupedMemberUserIds);

    return {
      ownerUserId,
      memberUserIds: dedupedMemberUserIds,
      mutedMemberUserIds,
      readStates,
      memberCount: dedupedMemberUserIds.length,
    };
  }

  async function mergeChatStateDocs(sourceUserId, targetUserId) {
    const sourceId = sanitizeId(sourceUserId, "");
    const targetId = sanitizeId(targetUserId, "");
    if (!sourceId || !targetId || sourceId === targetId || !isMongoObjectIdLike(sourceId) || !isMongoObjectIdLike(targetId)) {
      return "skipped";
    }
    const sourceObjectId = new mongoose.Types.ObjectId(sourceId);
    const targetObjectId = new mongoose.Types.ObjectId(targetId);
    const [sourceState, targetState] = await Promise.all([
      ChatState.findOne({ userId: sourceObjectId }),
      ChatState.findOne({ userId: targetObjectId }),
    ]);
    if (!sourceState) return "none";
    if (!targetState) {
      sourceState.userId = targetObjectId;
      await sourceState.save();
      return "moved";
    }
    await ChatState.deleteOne({ _id: sourceState._id });
    return "dropped";
  }

  app.get("/api/auth/admin/agent-e/settings", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const config = await readAgentEConfig();
    res.json(buildAgentEAdminSettingsResponse(config));
  });

  app.put("/api/auth/admin/agent-e/settings", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const next = await writeAgentEConfig(req.body || {});
    res.json(buildAgentEAdminSettingsResponse(next));
  });

  app.get("/api/auth/admin/agent-e/skills", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const config = await readAgentEConfig();
    const payload = buildAgentEAdminSettingsResponse(config);
    res.json({
      ok: true,
      skills: payload.config.skills,
      availableSkills: payload.availableSkills,
      updatedAt: payload.config.updatedAt,
    });
  });

  app.put("/api/auth/admin/agent-e/skills", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const config = await readAgentEConfig();
    const next = await writeAgentEConfig({
      ...config,
      skills: Array.isArray(req.body?.skills) ? req.body.skills : [],
    });
    const payload = buildAgentEAdminSettingsResponse(next);
    res.json({
      ok: true,
      skills: payload.config.skills,
      availableSkills: payload.availableSkills,
      updatedAt: payload.config.updatedAt,
    });
  });

  app.get("/api/auth/admin/me", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;

    res.json({
      ok: true,
      admin: {
        id: String(admin?._id || ""),
        username: admin?.username || "",
        role: admin?.role || "admin",
        createdAt: sanitizeIsoDate(admin?.createdAt),
        updatedAt: sanitizeIsoDate(admin?.updatedAt),
      },
      adminUsernames: FIXED_ADMIN_ACCOUNTS.map((item) => item.username),
    });
  });

  app.get("/api/auth/admin/users", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const users = await AuthUser.find({ role: "user" })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    res.json({
      ok: true,
      users: users.map((item) => ({
        username: item.username,
        role: item.role,
        password: item.passwordPlain || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  });

  app.get("/api/auth/admin/user-directory", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;

    try {
      const targetClasses = await readUserDirectoryTargetClasses();
      const targetClassKeys = new Set(targetClasses.map((item) => normalizeClassNameKey(item)));
      const users = await AuthUser.find({})
        .sort({ role: 1, createdAt: 1, _id: 1 })
        .lean();
      const items = (Array.isArray(users) ? users : []).map((user) =>
        buildUserDirectoryItem(user, targetClassKeys),
      );

      const summary = items.reduce(
        (acc, item) => {
          acc.totalCount += 1;
          if (item.role === "admin") {
            acc.adminCount += 1;
            return acc;
          }
          acc.studentCount += 1;
          if (item.classBucket === "target") {
            acc.targetClassStudentCount += 1;
          } else if (item.classBucket === "other") {
            acc.otherClassStudentCount += 1;
          } else {
            acc.unassignedStudentCount += 1;
          }
          return acc;
        },
        {
          totalCount: 0,
          adminCount: 0,
          studentCount: 0,
          targetClassStudentCount: 0,
          otherClassStudentCount: 0,
          unassignedStudentCount: 0,
        },
      );

      res.json({
        ok: true,
        updatedAt: new Date().toISOString(),
        canManageUsers: isTerminalAdminAccount(admin),
        targetClasses,
        summary,
        users: items,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "读取用户信息失败，请稍后重试。",
      });
    }
  });

  app.post("/api/auth/admin/user-directory/class-categories", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    if (!isTerminalAdminAccount(admin)) {
      res.status(403).json({ error: "仅终端管理员可新增班级分类。" });
      return;
    }

    const className = sanitizeText(req.body?.className, "", 40);
    const classKey = normalizeClassNameKey(className);
    if (!className || !classKey) {
      res.status(400).json({ error: "请输入有效的班级名称。" });
      return;
    }

    try {
      const currentClasses = await readUserDirectoryTargetClasses();
      const keySet = new Set(currentClasses.map((item) => normalizeClassNameKey(item)));
      if (keySet.has(classKey)) {
        res.status(409).json({ error: "该班级分类已存在。" });
        return;
      }

      const nextClasses = mergeDefaultUserDirectoryTargetClasses([...currentClasses, className]);
      await UserDirectoryClassCategory.findOneAndUpdate(
        { key: ADMIN_CONFIG_KEY },
        {
          $set: {
            key: ADMIN_CONFIG_KEY,
            classNames: nextClasses,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      res.status(201).json({
        ok: true,
        updatedAt: new Date().toISOString(),
        targetClasses: nextClasses,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "新增班级分类失败，请稍后重试。",
      });
    }
  });

  app.post("/api/auth/admin/user-directory/users", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    if (!isTerminalAdminAccount(admin)) {
      res.status(403).json({ error: "仅终端管理员可新增用户账号。" });
      return;
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const bindTeacherRaw = String(payload?.bindTeacher || "")
      .trim()
      .toLowerCase();
    const bindTeacher =
      payload?.bindTeacher === true ||
      bindTeacherRaw === "true" ||
      bindTeacherRaw === "1" ||
      bindTeacherRaw === "yes";
    let lockedTeacherScopeKey = "";
    if (bindTeacher) {
      const lockedTeacherScopeInput = String(payload?.lockedTeacherScopeKey || "").trim();
      if (!lockedTeacherScopeInput) {
        res.status(400).json({ error: "请选择要绑定的老师。" });
        return;
      }
      lockedTeacherScopeKey = sanitizeTeacherScopeKey(lockedTeacherScopeInput);
    }

    const username = normalizeUsername(payload?.username) || sanitizeText(payload?.username, "", 64);
    if (!username) {
      res.status(400).json({ error: "账号不能为空或格式不合法。" });
      return;
    }
    const usernameKey = toUsernameKey(username);
    if (!usernameKey) {
      res.status(400).json({ error: "账号不能为空或格式不合法。" });
      return;
    }
    if (isReservedAdminUsernameKey(usernameKey)) {
      res.status(400).json({ error: "该账号为管理员保留账号，请使用其他账号名。" });
      return;
    }
    if (isFixedStudentUsernameKey(usernameKey)) {
      res.status(400).json({ error: "该账号名已在系统预置学生账号中使用，请更换后重试。" });
      return;
    }

    const password = String(payload?.password || "");
    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const profile = sanitizeUserProfile(payload?.profile);
    if (!profile.name) {
      res.status(400).json({ error: "姓名为必填项。" });
      return;
    }
    if (!profile.studentId) {
      res.status(400).json({ error: "学号为必填项。" });
      return;
    }
    if (!profile.className) {
      res.status(400).json({ error: "归属班级为必填项。" });
      return;
    }

    try {
      const duplicate = await AuthUser.findOne({ usernameKey })
        .select({ _id: 1 })
        .lean();
      if (duplicate) {
        res.status(409).json({ error: "账号已存在，请更换后重试。" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const created = await AuthUser.create({
        username,
        usernameKey,
        role: "user",
        passwordHash,
        passwordPlain: password,
        profile: {
          name: profile.name,
          studentId: profile.studentId,
          className: profile.className,
          grade: profile.grade,
          gender: profile.gender,
        },
        lockedTeacherScopeKey,
      });

      res.status(201).json({
        ok: true,
        updatedAt: new Date().toISOString(),
        user: buildUserDirectoryItem(created),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "新增用户账号失败，请稍后重试。",
      });
    }
  });

  app.put("/api/auth/admin/user-directory/users/:userId", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    if (!isTerminalAdminAccount(admin)) {
      res.status(403).json({ error: "仅终端管理员可编辑账号信息。" });
      return;
    }

    const userId = sanitizeId(req.params?.userId, "");
    if (!userId || !isMongoObjectIdLike(userId)) {
      res.status(400).json({ error: "无效用户 ID。" });
      return;
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const username = normalizeUsername(payload?.username) || sanitizeText(payload?.username, "", 64);
    if (!username) {
      res.status(400).json({ error: "账号不能为空或格式不合法。" });
      return;
    }
    const usernameKey = toUsernameKey(username);
    if (!usernameKey) {
      res.status(400).json({ error: "账号不能为空或格式不合法。" });
      return;
    }

    try {
      const user = await AuthUser.findById(userId);
      if (!user) {
        res.status(404).json({ error: "用户不存在或已删除。" });
        return;
      }
      const currentAdminId = sanitizeId(admin?._id, "");
      const targetUserId = sanitizeId(user?._id, "");
      if (targetUserId && currentAdminId && targetUserId === currentAdminId) {
        res.status(403).json({ error: "不支持修改当前登录账号，请联系其他终端管理员处理。" });
        return;
      }
      if (isTerminalAdminAccount(user)) {
        res.status(403).json({ error: "终端管理员账号不支持在此处修改。" });
        return;
      }

      const nextProfile = sanitizeUserProfile(payload?.profile);
      const duplicate = await AuthUser.findOne({
        usernameKey,
        _id: { $ne: user._id },
      })
        .select({ _id: 1 })
        .lean();
      if (duplicate) {
        res.status(409).json({ error: "账号已存在，请更换后重试。" });
        return;
      }

      user.username = username;
      user.usernameKey = usernameKey;
      user.profile = {
        ...sanitizeUserProfile(user.profile),
        ...nextProfile,
      };
      await user.save();

      res.json({
        ok: true,
        updatedAt: new Date().toISOString(),
        user: buildUserDirectoryItem(user),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "更新账号信息失败，请稍后重试。",
      });
    }
  });

  app.delete("/api/auth/admin/user-directory/users/:userId", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    if (!isTerminalAdminAccount(admin)) {
      res.status(403).json({ error: "仅终端管理员可删除账号。" });
      return;
    }

    const userId = sanitizeId(req.params?.userId, "");
    if (!userId || !isMongoObjectIdLike(userId)) {
      res.status(400).json({ error: "无效用户 ID。" });
      return;
    }

    const confirmText = sanitizeText(req.body?.confirmText, "", 20);
    if (confirmText !== "确认删除") {
      res.status(400).json({ error: "请输入“确认删除”完成二次确认。" });
      return;
    }

    try {
      const user = await AuthUser.findById(userId);
      if (!user) {
        res.status(404).json({ error: "用户不存在或已删除。" });
        return;
      }
      const currentAdminId = sanitizeId(admin?._id, "");
      const targetUserId = sanitizeId(user?._id, "");
      if (targetUserId && currentAdminId && targetUserId === currentAdminId) {
        res.status(403).json({ error: "不支持删除当前登录账号，请联系其他终端管理员处理。" });
        return;
      }
      if (isTerminalAdminAccount(user)) {
        res.status(403).json({ error: "终端管理员账号不支持在此处删除。" });
        return;
      }

      const scopedRegex = buildScopedUserIdRegex(userId);
      const [generatedImages, groupChatFilesByUploader, relatedRoomDocs] = await Promise.all([
        scopedRegex
          ? GeneratedImageHistory.find(
              { userId: scopedRegex },
              { _id: 1, ossKey: 1, ossBucket: 1, ossRegion: 1 },
            ).lean()
          : [],
        GroupChatStoredFile.find(
          { uploaderUserId: userId },
          { _id: 1, ossKey: 1, ossBucket: 1, ossRegion: 1 },
        ).lean(),
        GroupChatRoom.find(
          {
            $or: [
              { ownerUserId: userId },
              { memberUserIds: userId },
              { mutedMemberUserIds: userId },
              { "readStates.userId": userId },
            ],
          },
          {
            _id: 1,
            ownerUserId: 1,
            memberUserIds: 1,
            mutedMemberUserIds: 1,
            readStates: 1,
          },
        ).lean(),
      ]);

      await deleteGeneratedImageHistoryOssObjects(generatedImages);
      await deleteGroupChatStoredFileObjects(groupChatFilesByUploader);

      const roomIdsToDelete = [];
      const roomUpdateOps = [];
      (Array.isArray(relatedRoomDocs) ? relatedRoomDocs : []).forEach((room) => {
        const roomId = sanitizeId(room?._id, "");
        if (!roomId) return;
        const nextRoomState = remapGroupChatRoomStateUsers(room, userId, "");
        if (!nextRoomState || !nextRoomState.ownerUserId) {
          roomIdsToDelete.push(roomId);
          return;
        }
        roomUpdateOps.push({
          updateOne: {
            filter: { _id: roomId },
            update: {
              $set: {
                ownerUserId: nextRoomState.ownerUserId,
                memberUserIds: nextRoomState.memberUserIds,
                mutedMemberUserIds: nextRoomState.mutedMemberUserIds,
                readStates: nextRoomState.readStates,
                memberCount: nextRoomState.memberCount,
              },
            },
          },
        });
      });

      let deletedRoomCount = 0;
      if (roomIdsToDelete.length > 0) {
        const deletingRoomFiles = await GroupChatStoredFile.find(
          { roomId: { $in: roomIdsToDelete } },
          { _id: 1, ossKey: 1, ossBucket: 1, ossRegion: 1 },
        ).lean();
        await deleteGroupChatStoredFileObjects(deletingRoomFiles);
        const [deletedRooms] = await Promise.all([
          GroupChatRoom.deleteMany({ _id: { $in: roomIdsToDelete } }),
          GroupChatMessage.deleteMany({ roomId: { $in: roomIdsToDelete } }),
          GroupChatStoredFile.deleteMany({ roomId: { $in: roomIdsToDelete } }),
        ]);
        deletedRoomCount = Number(deletedRooms?.deletedCount || 0);
      }

      if (roomUpdateOps.length > 0) {
        await GroupChatRoom.bulkWrite(roomUpdateOps, { ordered: false });
      }

      const reactionDocs = await GroupChatMessage.find(
        { "reactions.userId": userId },
        { _id: 1, reactions: 1 },
      ).lean();
      if (reactionDocs.length > 0) {
        const reactionOps = reactionDocs
          .map((doc) => {
            const reactions = Array.isArray(doc?.reactions)
              ? doc.reactions.filter((reaction) => sanitizeId(reaction?.userId, "") !== userId)
              : [];
            return {
              updateOne: {
                filter: { _id: doc._id },
                update: { $set: { reactions } },
              },
            };
          })
          .filter(Boolean);
        if (reactionOps.length > 0) {
          await GroupChatMessage.bulkWrite(reactionOps, { ordered: false });
        }
      }

      const sourceObjectId = new mongoose.Types.ObjectId(userId);
      const [chatStateDeleteResult, uploadedDeleteCount, generatedDeleteResult, messageUpdateResult, fileDeleteResult] =
        await Promise.all([
          ChatState.deleteOne({ userId: sourceObjectId }),
          deleteCollectionStorageUserIds(UploadedFileContext, userId),
          GeneratedImageHistory.deleteMany(scopedRegex ? { userId: scopedRegex } : { _id: null }),
          GroupChatMessage.updateMany({ senderUserId: userId }, { $set: { senderUserId: "" } }),
          GroupChatStoredFile.deleteMany({ uploaderUserId: userId }),
        ]);

      await AuthUser.deleteOne({ _id: sourceObjectId });
      userOnlinePresenceByUserId.delete(userId);

      res.json({
        ok: true,
        userId,
        deletedRoomCount,
        deletedChatStateCount: Number(chatStateDeleteResult?.deletedCount || 0),
        deletedUploadedFileContextCount: Number(uploadedDeleteCount || 0),
        deletedGeneratedImageCount: Number(generatedDeleteResult?.deletedCount || 0),
        anonymizedGroupMessageCount: Number(messageUpdateResult?.modifiedCount || 0),
        deletedGroupFileCount: Number(fileDeleteResult?.deletedCount || 0),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "删除账号失败，请稍后重试。",
      });
    }
  });

  app.post("/api/auth/admin/user-directory/merge", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    if (!isTerminalAdminAccount(admin)) {
      res.status(403).json({ error: "仅终端管理员可执行账号合并。" });
      return;
    }

    const sourceUserId = sanitizeId(req.body?.sourceUserId, "");
    const targetUserId = sanitizeId(req.body?.targetUserId, "");
    const confirmText = sanitizeText(req.body?.confirmText, "", 20);
    if (confirmText !== "确认合并") {
      res.status(400).json({ error: "请输入“确认合并”完成二次确认。" });
      return;
    }
    if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
      res.status(400).json({ error: "请选择两个不同的学生账号执行合并。" });
      return;
    }
    if (!isMongoObjectIdLike(sourceUserId) || !isMongoObjectIdLike(targetUserId)) {
      res.status(400).json({ error: "无效用户 ID。" });
      return;
    }

    try {
      const [sourceUser, targetUser] = await Promise.all([
        AuthUser.findById(sourceUserId),
        AuthUser.findById(targetUserId),
      ]);
      if (!sourceUser || !targetUser) {
        res.status(404).json({ error: "待合并账号不存在或已删除。" });
        return;
      }
      if (String(sourceUser.role || "").trim() !== "user" || String(targetUser.role || "").trim() !== "user") {
        res.status(403).json({ error: "仅支持学生账号合并。" });
        return;
      }

      const sourceProfile = sanitizeUserProfile(sourceUser.profile);
      const targetProfile = sanitizeUserProfile(targetUser.profile);
      targetUser.profile = {
        name: targetProfile.name || sourceProfile.name,
        studentId: targetProfile.studentId || sourceProfile.studentId,
        gender: targetProfile.gender || sourceProfile.gender,
        grade: targetProfile.grade || sourceProfile.grade,
        className: targetProfile.className || sourceProfile.className,
      };
      await targetUser.save();

      await Promise.all([
        remapCollectionStorageUserIds(UploadedFileContext, sourceUserId, targetUserId),
        remapCollectionStorageUserIds(GeneratedImageHistory, sourceUserId, targetUserId),
      ]);

      await Promise.all([
        GroupChatStoredFile.updateMany(
          { uploaderUserId: sourceUserId },
          { $set: { uploaderUserId: targetUserId } },
        ),
        GroupChatMessage.updateMany(
          { senderUserId: sourceUserId },
          { $set: { senderUserId: targetUserId } },
        ),
      ]);

      const reactionDocs = await GroupChatMessage.find(
        { "reactions.userId": sourceUserId },
        { _id: 1, reactions: 1 },
      ).lean();
      if (reactionDocs.length > 0) {
        const reactionOps = reactionDocs.map((doc) => {
          const reactionMap = new Map();
          (Array.isArray(doc?.reactions) ? doc.reactions : []).forEach((reaction) => {
            const userId = sanitizeId(reaction?.userId, "");
            const nextUserId = userId === sourceUserId ? targetUserId : userId;
            const emoji = sanitizeGroupChatReactionEmoji(reaction?.emoji);
            if (!nextUserId || !emoji) return;
            const dedupeKey = `${nextUserId}::${emoji}`;
            if (reactionMap.has(dedupeKey)) return;
            reactionMap.set(dedupeKey, {
              ...reaction,
              userId: nextUserId,
            });
          });
          return {
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { reactions: Array.from(reactionMap.values()) } },
            },
          };
        });
        if (reactionOps.length > 0) {
          await GroupChatMessage.bulkWrite(reactionOps, { ordered: false });
        }
      }

      const relatedRoomDocs = await GroupChatRoom.find(
        {
          $or: [
            { ownerUserId: sourceUserId },
            { memberUserIds: sourceUserId },
            { mutedMemberUserIds: sourceUserId },
            { "readStates.userId": sourceUserId },
          ],
        },
        {
          _id: 1,
          ownerUserId: 1,
          memberUserIds: 1,
          mutedMemberUserIds: 1,
          readStates: 1,
        },
      ).lean();

      if (relatedRoomDocs.length > 0) {
        const roomUpdateOps = relatedRoomDocs
          .map((room) => {
            const nextState = remapGroupChatRoomStateUsers(room, sourceUserId, targetUserId);
            if (!nextState) return null;
            return {
              updateOne: {
                filter: { _id: room._id },
                update: {
                  $set: {
                    ownerUserId: nextState.ownerUserId,
                    memberUserIds: nextState.memberUserIds,
                    mutedMemberUserIds: nextState.mutedMemberUserIds,
                    readStates: nextState.readStates,
                    memberCount: nextState.memberCount,
                  },
                },
              },
            };
          })
          .filter(Boolean);
        if (roomUpdateOps.length > 0) {
          await GroupChatRoom.bulkWrite(roomUpdateOps, { ordered: false });
        }
      }

      const chatStateMergeMode = await mergeChatStateDocs(sourceUserId, targetUserId);

      await AuthUser.deleteOne({ _id: sourceUser._id });
      userOnlinePresenceByUserId.delete(sourceUserId);

      res.json({
        ok: true,
        sourceUserId,
        targetUserId,
        updatedAt: new Date().toISOString(),
        chatStateMergeMode,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "账号合并失败，请稍后重试。",
      });
    }
  });

  app.get("/api/auth/admin/group-chat/rooms", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const adminOrderMap = new Map(
      FIXED_ADMIN_ACCOUNTS.map((item, idx) => [toUsernameKey(item?.username), idx]),
    );
    const adminDefaultOrder = FIXED_ADMIN_ACCOUNTS.length + 200;
    const adminFallbackOrder = FIXED_ADMIN_ACCOUNTS.length + 80;

    const resolveAdminOrder = (user = null) => {
      if (!user || user.role !== "admin") return adminDefaultOrder;
      const usernameKey =
        toUsernameKey(user.username) ||
        toUsernameKey(user.usernameKey) ||
        toUsernameKey(user.displayName);
      if (adminOrderMap.has(usernameKey)) {
        return adminOrderMap.get(usernameKey);
      }
      return adminFallbackOrder;
    };

    const buildMemberItem = (userId, usersById) => {
      const safeUserId = sanitizeId(userId, "");
      const user = usersById.get(safeUserId);
      if (!safeUserId) return null;
      if (!user) {
        return {
          id: safeUserId,
          username: "",
          displayName: "未知用户",
          role: "",
          className: "",
          studentId: "",
          adminOrder: adminDefaultOrder,
        };
      }

      const profile = sanitizeUserProfile(user?.profile);
      const username = sanitizeText(user?.username, "", 64);
      const displayName = sanitizeText(
        profile.name || username,
        username || "未知用户",
        64,
      );
      return {
        id: safeUserId,
        username,
        displayName,
        role: sanitizeText(user?.role, "", 20),
        className: sanitizeText(profile.className, "", 40),
        studentId: sanitizeText(profile.studentId, "", 20),
        adminOrder: resolveAdminOrder({
          role: user?.role,
          username,
          usernameKey: user?.usernameKey,
          displayName,
        }),
      };
    };

    try {
      const rawRooms = await GroupChatRoom.find(
        {},
        {
          roomCode: 1,
          name: 1,
          ownerUserId: 1,
          memberUserIds: 1,
          partyAgentMemberEnabled: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      )
        .sort({ updatedAt: -1, _id: 1 })
        .lean();
      const rooms = (Array.isArray(rawRooms) ? rawRooms : [])
        .map((room) => normalizeGroupChatRoomDoc(room))
        .filter(Boolean);

      const userIdSet = new Set();
      rooms.forEach((room) => {
        const ownerUserId = sanitizeId(room?.ownerUserId, "");
        if (ownerUserId) userIdSet.add(ownerUserId);
        sanitizeGroupChatMemberUserIds(room?.memberUserIds).forEach((userId) => {
          userIdSet.add(userId);
        });
      });

      const users = userIdSet.size
        ? await AuthUser.find(
            { _id: { $in: Array.from(userIdSet) } },
            { username: 1, usernameKey: 1, profile: 1, role: 1 },
          ).lean()
        : [];
      const usersById = new Map(
        users.map((user) => [sanitizeId(user?._id, ""), user]),
      );
      const allUsers = await AuthUser.find(
        {},
        { username: 1, usernameKey: 1, profile: 1, role: 1 },
      ).lean();
      const userOptions = (Array.isArray(allUsers) ? allUsers : [])
        .map((user) => {
          const userId = sanitizeId(user?._id, "");
          if (!userId) return null;
          const profile = sanitizeUserProfile(user?.profile);
          const username = sanitizeText(user?.username, "", 64);
          const displayName = sanitizeText(
            profile.name || username,
            username || "未知用户",
            64,
          );
          const role = sanitizeText(user?.role, "user", 20).toLowerCase() === "admin" ? "admin" : "user";
          return {
            id: userId,
            username,
            displayName,
            role,
            className: sanitizeText(profile.className, "", 40),
            studentId: sanitizeText(profile.studentId, "", 20),
            adminOrder: resolveAdminOrder({
              role,
              username,
              usernameKey: user?.usernameKey,
              displayName,
            }),
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const roleOrderA = a.role === "admin" ? 0 : 1;
          const roleOrderB = b.role === "admin" ? 0 : 1;
          if (roleOrderA !== roleOrderB) return roleOrderA - roleOrderB;
          if (a.role === "admin") {
            if (a.adminOrder !== b.adminOrder) return a.adminOrder - b.adminOrder;
            return String(a.displayName || "").localeCompare(String(b.displayName || ""), "zh-CN", {
              sensitivity: "base",
            });
          }
          const classCompare = String(a.className || "").localeCompare(String(b.className || ""), "zh-CN", {
            sensitivity: "base",
            numeric: true,
          });
          if (classCompare !== 0) return classCompare;
          const studentIdCompare = String(a.studentId || "").localeCompare(
            String(b.studentId || ""),
            "zh-CN",
            {
              sensitivity: "base",
              numeric: true,
            },
          );
          if (studentIdCompare !== 0) return studentIdCompare;
          return String(a.displayName || "").localeCompare(String(b.displayName || ""), "zh-CN", {
            sensitivity: "base",
          });
        });

      const payloadRooms = rooms
        .map((room) => {
          const roomId = sanitizeId(room?.id, "");
          if (!roomId) return null;
          const ownerUserId = sanitizeId(room?.ownerUserId, "");
          const owner = buildMemberItem(ownerUserId, usersById);
          const ownerSortOrder = owner?.adminOrder ?? adminDefaultOrder;
          const members = sanitizeGroupChatMemberUserIds(room?.memberUserIds)
            .map((memberId) => buildMemberItem(memberId, usersById))
            .filter(Boolean)
            .sort((a, b) => {
              if (a.id === ownerUserId) return -1;
              if (b.id === ownerUserId) return 1;
              if (a.adminOrder !== b.adminOrder) return a.adminOrder - b.adminOrder;
              return String(a.displayName || "").localeCompare(
                String(b.displayName || ""),
                "zh-CN",
                { sensitivity: "base" },
              );
            });

          if (owner && !members.some((member) => member.id === owner.id)) {
            members.unshift(owner);
          }

          return {
            id: roomId,
            roomCode: sanitizeText(room?.roomCode, "", 32),
            name: sanitizeText(room?.name, "未命名派", 80),
            partyAgentMemberEnabled: sanitizeRuntimeBoolean(room?.partyAgentMemberEnabled, true),
            memberCount: members.length,
            owner,
            members,
            createdAt: sanitizeIsoDate(room?.createdAt),
            updatedAt: sanitizeIsoDate(room?.updatedAt),
            ownerAdminSortOrder: ownerSortOrder,
          };
        })
        .filter(Boolean);

      payloadRooms.sort((a, b) => {
        if (a.ownerAdminSortOrder !== b.ownerAdminSortOrder) {
          return a.ownerAdminSortOrder - b.ownerAdminSortOrder;
        }
        const ownerCompare = String(a.owner?.displayName || "").localeCompare(
          String(b.owner?.displayName || ""),
          "zh-CN",
          { sensitivity: "base" },
        );
        if (ownerCompare !== 0) return ownerCompare;
        const updatedDiff =
          (Date.parse(String(b.updatedAt || "")) || 0) -
          (Date.parse(String(a.updatedAt || "")) || 0);
        if (updatedDiff !== 0) return updatedDiff;
        return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN", {
          sensitivity: "base",
        });
      });

      res.json({
        ok: true,
        updatedAt: new Date().toISOString(),
        totalRoomCount: payloadRooms.length,
        users: userOptions,
        rooms: payloadRooms,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "读取群聊派列表失败，请稍后重试。",
      });
    }
  });

  app.post("/api/auth/admin/group-chat/rooms", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;

    const roomName = sanitizeGroupChatRoomName(req.body?.name);
    const ownerUserId = sanitizeId(req.body?.ownerUserId, "");
    const inputMemberUserIds = Array.isArray(req.body?.memberUserIds) ? req.body.memberUserIds : [];
    const rawMemberUserIds = Array.from(
      new Set(
        inputMemberUserIds
          .map((item) => sanitizeId(item, ""))
          .filter(Boolean),
      ),
    );

    if (!roomName) {
      res.status(400).json({ error: "请输入群名称。" });
      return;
    }
    if (!ownerUserId || !isMongoObjectIdLike(ownerUserId)) {
      res.status(400).json({ error: "请选择有效的群主账号。" });
      return;
    }

    const memberUserIdSet = new Set(rawMemberUserIds);
    memberUserIdSet.add(ownerUserId);
    const finalMemberUserIds = Array.from(memberUserIdSet);
    if (finalMemberUserIds.length > GROUP_CHAT_MAX_MEMBERS_PER_ROOM) {
      res.status(400).json({
        error: `成员数量不能超过 ${GROUP_CHAT_MAX_MEMBERS_PER_ROOM} 人。`,
      });
      return;
    }
    if (finalMemberUserIds.length === 0) {
      res.status(400).json({ error: "请至少选择 1 位成员。" });
      return;
    }

    try {
      const selectedUsers = await AuthUser.find(
        { _id: { $in: finalMemberUserIds } },
        { username: 1, profile: 1, role: 1 },
      ).lean();
      const usersById = new Map(
        (Array.isArray(selectedUsers) ? selectedUsers : []).map((user) => [
          sanitizeId(user?._id, ""),
          user,
        ]),
      );
      if (usersById.size !== finalMemberUserIds.length) {
        res.status(400).json({ error: "群成员中存在已失效账号，请刷新列表后重试。" });
        return;
      }
      const ownerUser = usersById.get(ownerUserId);
      if (!ownerUser) {
        res.status(400).json({ error: "群主账号不存在，请刷新后重试。" });
        return;
      }

      const [ownerCreatedCount, joinedCountRows] = await Promise.all([
        GroupChatRoom.countDocuments({ ownerUserId }),
        Promise.all(
          finalMemberUserIds.map(async (memberUserId) => ({
            userId: memberUserId,
            count: await GroupChatRoom.countDocuments({ memberUserIds: memberUserId }),
          })),
        ),
      ]);
      if (
        sanitizeText(ownerUser?.role, "user", 20).toLowerCase() !== "admin" &&
        ownerCreatedCount >= GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER
      ) {
        const ownerProfile = sanitizeUserProfile(ownerUser?.profile);
        const ownerDisplayName = sanitizeText(
          ownerProfile.name || ownerUser?.username,
          ownerUser?.username || "该用户",
          64,
        );
        res.status(400).json({
          error: `群主「${ownerDisplayName}」已达到可创建群聊上限（${GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER} 个）。`,
        });
        return;
      }
      const exceededMember = joinedCountRows.find(
        (item) => Number(item?.count || 0) >= GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER,
      );
      if (exceededMember) {
        const exceededUser = usersById.get(sanitizeId(exceededMember?.userId, ""));
        const profile = sanitizeUserProfile(exceededUser?.profile);
        const displayName = sanitizeText(
          profile.name || exceededUser?.username,
          exceededUser?.username || "该成员",
          64,
        );
        res.status(400).json({
          error: `成员「${displayName}」已达到可加入群聊上限（${GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER} 个）。`,
        });
        return;
      }

      const roomCode = await generateUniqueGroupChatRoomCode();
      const roomDoc = await GroupChatRoom.create({
        roomCode,
        name: roomName,
        ownerUserId,
        memberUserIds: sanitizeGroupChatMemberUserIds(finalMemberUserIds),
        memberCount: finalMemberUserIds.length,
      });
      const roomId = sanitizeId(roomDoc?._id, "");

      const adminName = sanitizeText(
        buildGroupChatDisplayName(admin) || admin?.username,
        sanitizeText(admin?.username, "管理员", 64) || "管理员",
        64,
      );
      const ownerProfile = sanitizeUserProfile(ownerUser?.profile);
      const ownerDisplayName = sanitizeText(
        ownerProfile.name || ownerUser?.username,
        ownerUser?.username || "派主",
        64,
      );

      const systemMessageDoc = roomId
        ? await createGroupChatSystemMessage({
            roomId,
            content: `${adminName} 在后台创建了派，派主：${ownerDisplayName}`,
          })
        : null;
      if (roomId && systemMessageDoc?._id) {
        await markGroupChatRoomReadByMessageId({
          roomId,
          userId: ownerUserId,
          messageId: sanitizeId(systemMessageDoc?._id, ""),
        });
        broadcastGroupChatMessageCreated(roomId, systemMessageDoc);
      }

      const normalizedRoom = normalizeGroupChatRoomDoc(roomDoc);
      if (roomId && normalizedRoom) {
        broadcastGroupChatRoomUpdated(roomId, normalizedRoom);
      }

      res.status(201).json({
        ok: true,
        roomId,
        room: normalizedRoom,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "创建群聊失败，请稍后重试。",
      });
    }
  });

  app.delete("/api/auth/admin/group-chat/rooms/:roomId", async (req, res) => {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;

    const roomId = sanitizeId(req.params?.roomId, "");
    if (!roomId) {
      res.status(400).json({ error: "无效参数。" });
      return;
    }
    if (!isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效群聊 ID。" });
      return;
    }

    try {
      const room = await GroupChatRoom.findById(roomId).lean();
      const normalizedRoom = normalizeGroupChatRoomDoc(room);
      if (!normalizedRoom) {
        res.status(404).json({ error: "群聊不存在或已失效。" });
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

      const adminId = sanitizeId(admin?._id, "");
      const adminName = sanitizeText(admin?.username, "管理员", 64) || "管理员";
      broadcastGroupChatRoomDissolved(roomId, {
        id: adminId || "admin",
        name: adminName,
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

  app.get("/api/auth/admin/images/history", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const keyword = sanitizeText(req.query?.keyword, "", 80);
    const keywordLower = keyword.toLowerCase();
    const limit = sanitizeRuntimeInteger(req.query?.limit, 0, 0, 20000);

    let docs = [];
    try {
      let query = GeneratedImageHistory.find(
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
            { imageStorageType: "oss" },
          ],
        },
        {
          userId: 1,
          prompt: 1,
          imageStorageType: 1,
          imageUrl: 1,
          imageMimeType: 1,
          size: 1,
          model: 1,
          createdAt: 1,
        },
      )
        .sort({ createdAt: -1, _id: -1 });
      if (limit > 0) {
        query = query.limit(limit);
      }
      docs = await query.lean();
    } catch (error) {
      res.status(500).json({
        error: error?.message || "读取图片管理列表失败，请稍后重试。",
      });
      return;
    }

    let groups = [];
    try {
      const imageItems = Array.isArray(docs) ? docs.map(toAdminGeneratedImageHistoryItem) : [];
      const baseUserIdSet = new Set(
        imageItems
          .map((item) => sanitizeId(item?.baseUserId, ""))
          .filter((id) => id && isMongoObjectIdLike(id)),
      );

      const rosterUsers = baseUserIdSet.size
        ? await AuthUser.find(
            {
              _id: { $in: Array.from(baseUserIdSet) },
              role: "user",
            },
            { username: 1, profile: 1 },
          ).lean()
        : [];
      const rosterByUserId = new Map(
        rosterUsers.map((user) => {
          const userId = sanitizeId(user?._id, "");
          const profile = sanitizeUserProfile(user?.profile);
          return [
            userId,
            {
              userId,
              username: sanitizeText(user?.username, "", 64),
              studentName: sanitizeText(profile.name || user?.username, "", 64),
              studentId: sanitizeText(profile.studentId, "", 20),
              className: sanitizeText(profile.className, "", 40),
            },
          ];
        }),
      );

      const groupMap = new Map();
      imageItems.forEach((item) => {
        const baseUserId = sanitizeId(item?.baseUserId, "");
        const roster = rosterByUserId.get(baseUserId);
        if (!baseUserId || !roster) return;

        if (!groupMap.has(baseUserId)) {
          groupMap.set(baseUserId, {
            userId: baseUserId,
            baseUserId,
            username: roster.username,
            studentName: roster.studentName,
            studentId: roster.studentId,
            className: roster.className,
            imageCount: 0,
            latestCreatedAt: "",
            images: [],
          });
        }

        const group = groupMap.get(baseUserId);
        group.images.push(item);
        group.imageCount += 1;
        if (
          !group.latestCreatedAt ||
          Date.parse(item.createdAt) > Date.parse(group.latestCreatedAt)
        ) {
          group.latestCreatedAt = item.createdAt;
        }
      });

      groups = Array.from(groupMap.values()).map((group) => {
        const sortedImages = [...group.images].sort((a, b) => {
          const aTime = Date.parse(a?.createdAt || "") || 0;
          const bTime = Date.parse(b?.createdAt || "") || 0;
          if (bTime !== aTime) return bTime - aTime;
          return String(b?.id || "").localeCompare(String(a?.id || ""), "zh-CN");
        });
        return {
          ...group,
          imageCount: sortedImages.length,
          latestCreatedAt: sortedImages[0]?.createdAt || "",
          images: sortedImages,
        };
      });

      if (keywordLower) {
        groups = groups.filter((group) => {
          const fields = [
            group?.studentName,
            group?.username,
            group?.studentId,
            group?.className,
            group?.userId,
          ];
          return fields.some((field) =>
            String(field || "").toLowerCase().includes(keywordLower),
          );
        });
      }

      groups.sort((a, b) => {
        const aTime = Date.parse(a?.latestCreatedAt || "") || 0;
        const bTime = Date.parse(b?.latestCreatedAt || "") || 0;
        if (bTime !== aTime) return bTime - aTime;
        return compareClassroomRosterStudent(a, b);
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "整理图片管理列表失败，请稍后重试。",
      });
      return;
    }

    res.json({
      ok: true,
      keyword,
      updatedAt: new Date().toISOString(),
      totalGroupCount: groups.length,
      totalImageCount: groups.reduce((sum, group) => sum + Number(group?.imageCount || 0), 0),
      groups,
    });
  });

  app.get("/api/auth/admin/images/history/:imageId/content", async (req, res) => {
    if (!(await authenticateAdminRequestFromHeaderOrQuery(req, res))) return;

    const imageId = sanitizeId(req.params?.imageId, "");
    const download = sanitizeRuntimeBoolean(req.query?.download, false);
    if (!imageId) {
      res.status(400).json({ error: "无效图片 ID。" });
      return;
    }

    try {
      const doc = await GeneratedImageHistory.findOne(
        { _id: imageId },
        {
          prompt: 1,
          imageUrl: 1,
          ossKey: 1,
          imageData: 1,
          imageMimeType: 1,
          imageStorageType: 1,
          createdAt: 1,
          expiresAt: 1,
        },
      ).lean();
      if (!doc) {
        res.status(404).json({ error: "图片不存在或已过期。" });
        return;
      }

      const storageType = normalizeGeneratedImageStorageType(doc?.imageStorageType);
      const expiresAt = sanitizeIsoDate(doc?.expiresAt);
      if (storageType !== "oss" && expiresAt && Date.parse(expiresAt) <= Date.now()) {
        res.status(410).json({ error: "图片已过期。" });
        return;
      }

      const mimeType = normalizeGeneratedImageMimeType(doc?.imageMimeType) || "image/png";
      const ext = resolveFileExtensionByMimeType(mimeType, "png");
      const fileName = sanitizeGroupChatFileName(
        `generated-image-${String(imageId).slice(-8) || imageId}.${ext}`,
      );
      const ossKey = sanitizeGroupChatOssObjectKey(doc?.ossKey);
      if (ossKey) {
        if (download) {
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
        } else if (groupChatOssClient && groupChatOssConfig && !groupChatOssConfig.publicRead) {
          try {
            const signedUrl = sanitizeGroupChatHttpUrl(
              await groupChatOssClient.asyncSignatureUrl(ossKey, {
                method: "GET",
                expires: groupChatOssConfig.signedUrlTtlSeconds,
              }),
            );
            if (/^https?:\/\//i.test(signedUrl)) {
              res.redirect(signedUrl);
              return;
            }
          } catch (error) {
            console.warn(
              `[image-management] OSS 预览地址生成失败（${ossKey}）：`,
              error?.message || error,
            );
          }
        }

        const directUrl =
          sanitizeGroupChatHttpUrl(doc?.imageUrl) || buildGroupChatOssObjectUrl(ossKey);
        if (/^https?:\/\//i.test(directUrl)) {
          if (download) {
            res.json({
              ok: true,
              downloadUrl: directUrl,
              fileName,
              mimeType,
            });
            return;
          }
          res.redirect(directUrl);
          return;
        }
      }

      const imageBuffer = extractGeneratedImageDataBuffer(doc?.imageData);
      if (imageBuffer.length > 0) {
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", String(imageBuffer.length));
        res.setHeader("Cache-Control", "private, no-store");
        if (download) {
          res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
        }
        res.send(imageBuffer);
        return;
      }

      const fallbackUrl = normalizeGeneratedImageStoreUrl(doc?.imageUrl || "");
      if (/^https?:\/\//i.test(fallbackUrl)) {
        if (download) {
          res.json({
            ok: true,
            downloadUrl: fallbackUrl,
            fileName,
            mimeType,
          });
        } else {
          res.redirect(fallbackUrl);
        }
        return;
      }

      const parsedDataUrl = parseGeneratedImageDataUrl(fallbackUrl);
      if (parsedDataUrl) {
        const fallbackMimeType =
          normalizeGeneratedImageMimeType(parsedDataUrl?.mimeType) || mimeType;
        const fallbackExt = resolveFileExtensionByMimeType(fallbackMimeType, "png");
        const fallbackFileName = sanitizeGroupChatFileName(
          `generated-image-${String(imageId).slice(-8) || imageId}.${fallbackExt}`,
        );
        res.setHeader("Content-Type", fallbackMimeType);
        res.setHeader("Content-Length", String(parsedDataUrl.data.length));
        res.setHeader("Cache-Control", "private, no-store");
        if (download) {
          res.setHeader(
            "Content-Disposition",
            buildAttachmentContentDisposition(fallbackFileName),
          );
        }
        res.send(parsedDataUrl.data);
        return;
      }

      res.status(404).json({ error: "图片不存在或已过期。" });
    } catch (error) {
      if (String(error?.name || "") === "CastError") {
        res.status(400).json({ error: "无效图片 ID。" });
        return;
      }
      res.status(500).json({
        error: error?.message || "读取图片内容失败，请稍后重试。",
      });
    }
  });

  app.get("/api/auth/admin/online-presence", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const classNameFilter = sanitizeText(req.query?.className, "", 40);
    const strictBrowserOpenClassNames = new Set(["810班", "811班"]);
    const nowMs = Date.now();
    const onlineEntries = collectOnlinePresenceEntries(nowMs);
    const onlineUserIds = onlineEntries.map((item) => item.userId);

    if (onlineUserIds.length === 0) {
      res.json({
        ok: true,
        generatedAt: new Date(nowMs).toISOString(),
        className: classNameFilter,
        onlineWindowSeconds: Math.floor(USER_ONLINE_ACTIVITY_WINDOW_MS / 1000),
        totalOnlineCount: 0,
        filteredOnlineCount: 0,
        users: [],
      });
      return;
    }

    const users = await AuthUser.find(
      { _id: { $in: onlineUserIds }, role: "user" },
      { username: 1, profile: 1 },
    ).lean();
    const userById = new Map(users.map((item) => [String(item?._id || ""), item]));

    const onlineUsers = onlineEntries
      .map((entry) => {
        const user = userById.get(entry.userId);
        if (!user) return null;
        const profile = sanitizeUserProfile(user.profile);
        return {
          userId: entry.userId,
          username: user.username || "",
          profile: {
            name: profile.name || "",
            studentId: profile.studentId || "",
            grade: profile.grade || "",
            className: profile.className || "",
          },
          lastSeenAt: sanitizeIsoDate(new Date(entry.lastSeenAtMs)) || new Date(nowMs).toISOString(),
          browserHeartbeatAt:
            entry.browserHeartbeatAtMs > 0
              ? sanitizeIsoDate(new Date(entry.browserHeartbeatAtMs))
              : null,
        };
      })
      .filter(Boolean);

    const effectiveOnlineUsers = onlineUsers.filter((item) => {
      const className = sanitizeText(item?.profile?.className, "", 40);
      if (!strictBrowserOpenClassNames.has(className)) return true;
      const heartbeatMs = new Date(item?.browserHeartbeatAt || 0).getTime() || 0;
      return heartbeatMs >= nowMs - USER_BROWSER_HEARTBEAT_STALE_MS;
    });

    const filteredUsers = classNameFilter
      ? effectiveOnlineUsers.filter(
          (item) => sanitizeText(item?.profile?.className, "", 40) === classNameFilter,
        )
      : effectiveOnlineUsers;

    res.json({
      ok: true,
      generatedAt: new Date(nowMs).toISOString(),
      className: classNameFilter,
      onlineWindowSeconds: Math.floor(USER_ONLINE_ACTIVITY_WINDOW_MS / 1000),
      heartbeatStaleSeconds: Math.floor(USER_BROWSER_HEARTBEAT_STALE_MS / 1000),
      totalOnlineCount: effectiveOnlineUsers.length,
      filteredOnlineCount: filteredUsers.length,
      users: filteredUsers,
    });
  });

  function selectTeacherScopeUsers(users, teacherScopeKey) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(teacherScopeKey);
    const source = Array.isArray(users) ? users : [];
    if (isDefaultTeacherScopeKey(safeTeacherScopeKey)) return source;
    return source.filter(
      (user) => resolveLoginLockedTeacherScopeKey(user) === safeTeacherScopeKey,
    );
  }

  async function readTeacherScopeExportUserContext(teacherScopeKey) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(teacherScopeKey);
    const users = await AuthUser.find({ role: "user" })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const scopedUsers = selectTeacherScopeUsers(users, safeTeacherScopeKey);
    const scopedUserIds = scopedUsers
      .map((user) => sanitizeId(user?._id, ""))
      .filter(Boolean);
    const scopedUserIdSet = new Set(scopedUserIds);
    const scopedStorageUserIds = scopedUserIds
      .map((userId) => buildTeacherScopedStorageUserId(userId, safeTeacherScopeKey))
      .filter(Boolean);
    return {
      safeTeacherScopeKey,
      users,
      scopedUsers,
      scopedUserIds,
      scopedUserIdSet,
      scopedStorageUserIds,
    };
  }

  async function readTeacherScopedChatStateMap(users, teacherScopeKey) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(teacherScopeKey);
    const sourceUsers = Array.isArray(users) ? users : [];
    const userIds = sourceUsers.map((user) => user?._id).filter(Boolean);
    if (userIds.length === 0) return new Map();

    const stateDocs = await ChatState.find({ userId: { $in: userIds } }).lean();
    return new Map(
      stateDocs.map((doc) => {
        const scoped = readTeacherScopedChatStateRaw(doc, safeTeacherScopeKey);
        return [
          String(doc.userId),
          scoped ? normalizeChatStateDoc(doc, safeTeacherScopeKey) : null,
        ];
      }),
    );
  }

  async function readAdminGroupChatsExportData(teacherScopeKey) {
    const userContext = await readTeacherScopeExportUserContext(teacherScopeKey);
    const roomFilter = userContext.scopedUserIds.length
      ? isDefaultTeacherScopeKey(userContext.safeTeacherScopeKey)
        ? {}
        : { memberUserIds: { $in: userContext.scopedUserIds } }
      : { _id: null };
    const rooms = await GroupChatRoom.find(roomFilter)
      .sort({ updatedAt: -1, _id: 1 })
      .lean();
    const roomIds = rooms
      .map((room) => sanitizeId(room?._id, ""))
      .filter(Boolean);

    const messageDocs = roomIds.length
      ? await GroupChatMessage.find({ roomId: { $in: roomIds } })
          .sort({ roomId: 1, createdAt: 1, _id: 1 })
          .lean()
      : [];
    const messagesByRoomId = new Map();
    messageDocs.forEach((message) => {
      const roomId = sanitizeId(message?.roomId, "");
      if (!roomId) return;
      if (!messagesByRoomId.has(roomId)) {
        messagesByRoomId.set(roomId, []);
      }
      messagesByRoomId.get(roomId).push(message);
    });

    const participantUserIds = new Set();
    rooms.forEach((room) => {
      participantUserIds.add(sanitizeId(room?.ownerUserId, ""));
      sanitizeGroupChatMemberUserIds(room?.memberUserIds).forEach((userId) => {
        participantUserIds.add(sanitizeId(userId, ""));
      });
    });
    messageDocs.forEach((message) => {
      participantUserIds.add(sanitizeId(message?.senderUserId, ""));
      const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
      reactions.forEach((reaction) => {
        participantUserIds.add(sanitizeId(reaction?.userId, ""));
      });
    });

    const participantUsers = participantUserIds.size
      ? await AuthUser.find(
          { _id: { $in: Array.from(participantUserIds).filter(Boolean) } },
          { username: 1, role: 1, profile: 1, lockedTeacherScopeKey: 1 },
        ).lean()
      : [];
    const userById = new Map(
      participantUsers.map((user) => {
        const userId = sanitizeId(user?._id, "");
        const profile = sanitizeUserProfile(user?.profile);
        const username = sanitizeText(user?.username, "", 64);
        const displayName = sanitizeText(profile?.name || username || userId, "", 64);
        return [
          userId,
          {
            userId,
            username,
            role: sanitizeText(user?.role, "user", 20),
            displayName,
            studentId: sanitizeText(profile?.studentId, "", 20),
            className: sanitizeText(profile?.className, "", 40),
            teacherScopeKey: resolveLoginLockedTeacherScopeKey(user),
          },
        ];
      }),
    );

    return {
      ...userContext,
      rooms,
      messagesByRoomId,
      userById,
    };
  }

  function buildAdminGroupChatsExportTxt(data) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(data?.safeTeacherScopeKey);
    const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
    const messagesByRoomId = data?.messagesByRoomId instanceof Map ? data.messagesByRoomId : new Map();
    const userById = data?.userById instanceof Map ? data.userById : new Map();
    const scopedUserCount = Number(data?.scopedUsers?.length || 0);
    const lines = [
      "EduChat 管理员导出：群聊聊天记录",
      `导出时间: ${formatDisplayTime(new Date())}`,
      `授课教师: ${getTeacherScopeLabel(safeTeacherScopeKey)}`,
      `范围内学生数: ${scopedUserCount}`,
      `群聊数量: ${rooms.length}`,
      "",
    ];

    if (rooms.length === 0) {
      lines.push("当前范围暂无群聊记录。");
      return lines.join("\n");
    }

    rooms.forEach((room, roomIndex) => {
      const roomId = sanitizeId(room?._id, "");
      const roomName = sanitizeText(room?.name, "未命名群聊", 80) || "未命名群聊";
      const roomCode = sanitizeText(room?.roomCode, "", 32);
      const ownerId = sanitizeId(room?.ownerUserId, "");
      const owner = ownerId ? userById.get(ownerId) : null;
      const ownerLabel = owner
        ? `${owner.displayName}${owner.username ? `(@${owner.username})` : ""}`
        : sanitizeText(room?.ownerUserId, "-", 64) || "-";
      const memberIds = sanitizeGroupChatMemberUserIds(room?.memberUserIds);
      const messages = Array.isArray(messagesByRoomId.get(roomId))
        ? messagesByRoomId.get(roomId)
        : [];

      lines.push(`群聊 ${roomIndex + 1}`);
      lines.push(`名称: ${roomName}`);
      lines.push(`群聊ID: ${roomId || "-"}`);
      lines.push(`群号: ${roomCode || "-"}`);
      lines.push(`群主: ${ownerLabel}`);
      lines.push(`成员数: ${memberIds.length}`);
      lines.push(`消息数: ${messages.length}`);
      lines.push(`创建时间: ${formatDisplayTime(room?.createdAt)}`);
      lines.push(`更新时间: ${formatDisplayTime(room?.updatedAt)}`);
      if (memberIds.length > 0) {
        lines.push("成员列表:");
        memberIds.forEach((memberId, memberIndex) => {
          const member = userById.get(memberId);
          if (!member) {
            lines.push(`  ${memberIndex + 1}. ${memberId}`);
            return;
          }
          const roleLabel = member.role === "admin" ? "管理员" : "学生";
          lines.push(
            `  ${memberIndex + 1}. ${member.displayName}${member.username ? `(@${member.username})` : ""} · ${roleLabel}${member.className ? ` · ${member.className}` : ""}${member.studentId ? ` · ${member.studentId}` : ""}`,
          );
        });
      } else {
        lines.push("成员列表: （空）");
      }

      if (messages.length === 0) {
        lines.push("聊天消息: （空）");
        lines.push("");
        return;
      }

      lines.push("聊天消息:");
      messages.forEach((message, messageIndex) => {
        const type = sanitizeText(message?.type, "text", 12) || "text";
        const senderId = sanitizeId(message?.senderUserId, "");
        const sender = senderId ? userById.get(senderId) : null;
        const senderName =
          sanitizeText(message?.senderName, "", 64) ||
          sender?.displayName ||
          (type === "system" ? "系统消息" : "未知成员");
        lines.push(
          `  ${messageIndex + 1}. [${formatDisplayTime(message?.createdAt)}] ${senderName} (${type})`,
        );
        if (type === "image") {
          lines.push(
            `      图片: ${sanitizeText(message?.image?.fileName, "未命名图片", 120)} · ${sanitizeText(message?.image?.mimeType, "-", 80)} · ${Number(message?.image?.size || 0)}B`,
          );
        } else if (type === "file") {
          lines.push(
            `      文件: ${sanitizeText(message?.file?.fileName, "未命名文件", 120)} · ${sanitizeText(message?.file?.mimeType, "-", 80)} · ${Number(message?.file?.size || 0)}B`,
          );
        }
        const messageContent = String(message?.content || "");
        if (messageContent.trim()) {
          lines.push("      内容:");
          appendIndentedBlock(lines, messageContent, 8);
        }
        const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
        if (reactions.length > 0) {
          const reactionText = reactions
            .slice(0, 20)
            .map((reaction) => {
              const emoji = sanitizeText(reaction?.emoji, "?", 16) || "?";
              const reactionUserId = sanitizeId(reaction?.userId, "");
              const reactionUser = reactionUserId ? userById.get(reactionUserId) : null;
              const reactionName = reactionUser?.displayName || sanitizeText(reaction?.userName, "-", 64) || "-";
              return `${emoji}(${reactionName})`;
            })
            .join(" ");
          lines.push(`      反馈: ${reactionText}`);
        }
      });
      lines.push("");
    });

    return lines.join("\n");
  }

  async function readAdminGeneratedImagesExportData(teacherScopeKey, userContext = null) {
    const context =
      userContext && typeof userContext === "object"
        ? userContext
        : await readTeacherScopeExportUserContext(teacherScopeKey);
    if (context.scopedStorageUserIds.length === 0) {
      return {
        ...context,
        docs: [],
      };
    }

    const docs = await GeneratedImageHistory.find(
      { userId: { $in: context.scopedStorageUserIds } },
      {
        userId: 1,
        prompt: 1,
        imageUrl: 1,
        imageStorageType: 1,
        imageMimeType: 1,
        imageSize: 1,
        responseFormat: 1,
        size: 1,
        model: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    )
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    return {
      ...context,
      docs,
    };
  }

  function buildAdminGeneratedImagesExportTxt(data) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(data?.safeTeacherScopeKey);
    const scopedUsers = Array.isArray(data?.scopedUsers) ? data.scopedUsers : [];
    const docs = Array.isArray(data?.docs) ? data.docs : [];
    const rosterById = new Map(
      scopedUsers.map((user) => {
        const userId = sanitizeId(user?._id, "");
        const profile = sanitizeUserProfile(user?.profile);
        return [
          userId,
          {
            username: sanitizeText(user?.username, "", 64),
            name: sanitizeText(profile?.name, "", 64),
            studentId: sanitizeText(profile?.studentId, "", 20),
            className: sanitizeText(profile?.className, "", 40),
          },
        ];
      }),
    );
    const lines = [
      "EduChat 管理员导出：学生生成图片记录",
      `导出时间: ${formatDisplayTime(new Date())}`,
      `授课教师: ${getTeacherScopeLabel(safeTeacherScopeKey)}`,
      `范围内学生数: ${scopedUsers.length}`,
      `图片记录数: ${docs.length}`,
      "",
    ];

    if (docs.length === 0) {
      lines.push("当前范围暂无图片记录。");
      return lines.join("\n");
    }

    docs.forEach((doc, index) => {
      const parsed = parseTeacherScopedStorageUserId(doc?.userId);
      const baseUserId = sanitizeId(parsed?.baseUserId || doc?.userId, "");
      const user = rosterById.get(baseUserId);
      lines.push(`记录 ${index + 1}`);
      lines.push(`图片ID: ${sanitizeId(doc?._id, "") || "-"}`);
      lines.push(`用户ID: ${baseUserId || "-"}`);
      lines.push(`账号: ${user?.username || "-"}`);
      lines.push(`姓名: ${user?.name || "-"}`);
      lines.push(`学号: ${user?.studentId || "-"}`);
      lines.push(`班级: ${user?.className || "-"}`);
      lines.push(`模型: ${sanitizeText(doc?.model, "-", 160) || "-"}`);
      lines.push(`尺寸: ${sanitizeText(doc?.size, "-", 80) || "-"}`);
      lines.push(`响应格式: ${sanitizeText(doc?.responseFormat, "-", 24) || "-"}`);
      lines.push(`存储类型: ${sanitizeText(doc?.imageStorageType, "-", 24) || "-"}`);
      lines.push(`MIME: ${sanitizeText(doc?.imageMimeType, "-", 80) || "-"}`);
      lines.push(`图片大小: ${Number(doc?.imageSize || 0)}B`);
      lines.push(`图片URL: ${sanitizeText(doc?.imageUrl, "-", 2400) || "-"}`);
      lines.push(`创建时间: ${formatDisplayTime(doc?.createdAt)}`);
      lines.push(`更新时间: ${formatDisplayTime(doc?.updatedAt)}`);
      lines.push("提示词:");
      appendIndentedBlock(lines, sanitizeText(doc?.prompt, "", 4000), 2);
      lines.push("");
    });

    return lines.join("\n");
  }

  function buildAllRecordsZipReadme(payload) {
    const safeTeacherScopeKey = sanitizeTeacherScopeKey(payload?.teacherScopeKey);
    return [
      "EduChat 管理员导出：全量记录归档 ZIP",
      `导出时间: ${formatDisplayTime(payload?.exportedAt || new Date())}`,
      `授课教师: ${getTeacherScopeLabel(safeTeacherScopeKey)}`,
      `学生账号数: ${Number(payload?.userCount || 0)}`,
      `作用域内学生数: ${Number(payload?.scopedUserCount || 0)}`,
      `群聊数量: ${Number(payload?.groupRoomCount || 0)}`,
      `图片记录数: ${Number(payload?.imageCount || 0)}`,
      "",
      "包含文件:",
      "1. users.txt: 学生账号与密码数据。",
      "2. chats.txt: 当前授课教师范围的聊天数据汇总。",
      "3. group-chats.txt: 群聊消息记录导出。",
      "4. generated-images.txt: 学生生成图片记录导出。",
      "5. chats-by-user/*.txt: 当前授课教师范围下按学生拆分的聊天数据。",
      "",
    ].join("\n");
  }

  app.get("/api/auth/admin/export/users-txt", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;

    const users = await AuthUser.find({ role: "user" })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const content = buildAdminUsersExportTxt(users);
    const suffix = formatFileStamp(new Date());
    res.json({
      ok: true,
      filename: `educhat-users-${suffix}.txt`,
      content,
    });
  });

  app.get("/api/auth/admin/export/chats-txt", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.query?.teacherScopeKey);

    const users = await AuthUser.find({ role: "user" })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const userIds = users.map((u) => u._id);
    const stateDocs = await ChatState.find({ userId: { $in: userIds } }).lean();
    const stateByUserId = new Map(
      stateDocs.map((doc) => {
        const scoped = readTeacherScopedChatStateRaw(doc, teacherScopeKey);
        return [
          String(doc.userId),
          scoped ? normalizeChatStateDoc(doc, teacherScopeKey) : null,
        ];
      }),
    );

    const content = buildAdminChatsExportTxt(users, stateByUserId, teacherScopeKey);
    const suffix = formatFileStamp(new Date());
    res.json({
      ok: true,
      filename: `educhat-chats-${teacherScopeKey}-${suffix}.txt`,
      content,
    });
  });

  app.get("/api/auth/admin/export/chats-zip", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.query?.teacherScopeKey);

    const users = await AuthUser.find({ role: "user" })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const userIds = users.map((u) => u._id);
    const stateDocs = await ChatState.find({ userId: { $in: userIds } }).lean();
    const stateByUserId = new Map(
      stateDocs.map((doc) => {
        const scoped = readTeacherScopedChatStateRaw(doc, teacherScopeKey);
        return [
          String(doc.userId),
          scoped ? normalizeChatStateDoc(doc, teacherScopeKey) : null,
        ];
      }),
    );

    const exportedAt = new Date();
    const userFiles = users.map((user, idx) => {
      const userId = String(user?._id || "");
      const state = stateByUserId.get(userId);
      const content = buildSingleUserChatExportTxt(
        user,
        state,
        idx + 1,
        exportedAt,
        teacherScopeKey,
      );
      const username = sanitizeZipFileNamePart(user?.username || `user-${idx + 1}`);
      const shortId = sanitizeZipFileNamePart(userId.slice(-8) || String(idx + 1));
      const fileName = `${String(idx + 1).padStart(3, "0")}-${username}-${shortId}.txt`;
      return { name: fileName, content };
    });

    const readmeContent = buildZipReadme(userFiles.length, exportedAt, teacherScopeKey);
    const zipBuffer = buildZipBuffer([
      { name: "README.txt", content: readmeContent },
      ...userFiles,
    ]);

    const suffix = formatFileStamp(exportedAt);
    const fileName = `educhat-chats-by-user-${teacherScopeKey}-${suffix}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
    res.send(zipBuffer);
  });

  app.get("/api/auth/admin/export/group-chats-txt", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.query?.teacherScopeKey);

    try {
      const data = await readAdminGroupChatsExportData(teacherScopeKey);
      const content = buildAdminGroupChatsExportTxt(data);
      const suffix = formatFileStamp(new Date());
      res.json({
        ok: true,
        filename: `educhat-group-chats-${teacherScopeKey}-${suffix}.txt`,
        content,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "导出群聊聊天记录失败，请稍后重试。",
      });
    }
  });

  app.get("/api/auth/admin/export/generated-images-txt", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.query?.teacherScopeKey);

    try {
      const userContext = await readTeacherScopeExportUserContext(teacherScopeKey);
      const data = await readAdminGeneratedImagesExportData(teacherScopeKey, userContext);
      const content = buildAdminGeneratedImagesExportTxt(data);
      const suffix = formatFileStamp(new Date());
      res.json({
        ok: true,
        filename: `educhat-generated-images-${teacherScopeKey}-${suffix}.txt`,
        content,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "导出学生生成图片记录失败，请稍后重试。",
      });
    }
  });

  app.get("/api/auth/admin/export/all-records-zip", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.query?.teacherScopeKey);

    try {
      const userContext = await readTeacherScopeExportUserContext(teacherScopeKey);
      const stateByUserId = await readTeacherScopedChatStateMap(
        userContext.users,
        teacherScopeKey,
      );
      const chatsTxt = buildAdminChatsExportTxt(
        userContext.users,
        stateByUserId,
        teacherScopeKey,
      );
      const usersTxt = buildAdminUsersExportTxt(userContext.users);

      const groupChatData = await readAdminGroupChatsExportData(teacherScopeKey);
      const groupChatsTxt = buildAdminGroupChatsExportTxt(groupChatData);

      const imageData = await readAdminGeneratedImagesExportData(
        teacherScopeKey,
        userContext,
      );
      const imagesTxt = buildAdminGeneratedImagesExportTxt(imageData);

      const exportedAt = new Date();
      const userChatFiles = userContext.scopedUsers.map((user, index) => {
        const userId = sanitizeId(user?._id, "");
        const state = stateByUserId.get(userId);
        const content = buildSingleUserChatExportTxt(
          user,
          state,
          index + 1,
          exportedAt,
          teacherScopeKey,
        );
        const username = sanitizeZipFileNamePart(user?.username || `user-${index + 1}`);
        const shortId = sanitizeZipFileNamePart(userId.slice(-8) || String(index + 1));
        return {
          name: `chats-by-user/${String(index + 1).padStart(3, "0")}-${username}-${shortId}.txt`,
          content,
        };
      });

      const readme = buildAllRecordsZipReadme({
        teacherScopeKey,
        exportedAt,
        userCount: userContext.users.length,
        scopedUserCount: userContext.scopedUsers.length,
        groupRoomCount: groupChatData.rooms.length,
        imageCount: imageData.docs.length,
      });
      const zipBuffer = buildZipBuffer([
        { name: "README.txt", content: readme },
        { name: "users.txt", content: usersTxt },
        { name: "chats.txt", content: chatsTxt },
        { name: "group-chats.txt", content: groupChatsTxt },
        { name: "generated-images.txt", content: imagesTxt },
        ...userChatFiles,
      ]);

      const suffix = formatFileStamp(exportedAt);
      const fileName = `educhat-all-records-${teacherScopeKey}-${suffix}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
      res.send(zipBuffer);
    } catch (error) {
      res.status(500).json({
        error: error?.message || "导出全量记录失败，请稍后重试。",
      });
    }
  });

  app.delete("/api/auth/admin/chats", async (req, res) => {
    if (!(await authenticateAdminRequest(req, res))) return;
    const teacherScopeKey = sanitizeTeacherScopeKey(req.query?.teacherScopeKey);
    const users = await AuthUser.find({ role: "user" }, { _id: 1 }).lean();
    const userIds = users.map((user) => user._id);
    const scopedUserIds = users
      .map((user) =>
        buildTeacherScopedStorageUserId(String(user?._id || ""), teacherScopeKey),
      )
      .filter(Boolean);

    const imageHistoryDocs = await GeneratedImageHistory.find(
      { userId: { $in: scopedUserIds } },
      { _id: 1, ossKey: 1 },
    ).lean();
    let deleteImageHistoryOssSummary = { deletedCount: 0, failedKeys: [] };
    try {
      deleteImageHistoryOssSummary = await deleteGeneratedImageHistoryOssObjects(
        imageHistoryDocs,
      );
    } catch (error) {
      console.warn(
        "Failed to delete image history OSS objects on admin clear:",
        error?.message || error,
      );
    }
    const chatStateResult = isDefaultTeacherScopeKey(teacherScopeKey)
      ? await ChatState.updateMany(
          { userId: { $in: userIds } },
          {
            $unset: {
              activeId: "",
              groups: "",
              sessions: "",
              sessionMessages: "",
              sessionContextRefs: "",
              settings: "",
            },
          },
        )
      : await ChatState.updateMany(
          { userId: { $in: userIds } },
          {
            $unset: {
              [`teacherStates.${teacherScopeKey}`]: "",
            },
          },
        );
    const [uploadedContextResult, imageHistoryResult] = await Promise.all([
      UploadedFileContext.deleteMany({ userId: { $in: scopedUserIds } }),
      GeneratedImageHistory.deleteMany({ userId: { $in: scopedUserIds } }),
    ]);
    res.json({
      ok: true,
      teacherScopeKey,
      teacherScopeLabel: getTeacherScopeLabel(teacherScopeKey),
      deletedCount: Number(chatStateResult?.modifiedCount || 0),
      deletedUploadedFileContextCount: Number(uploadedContextResult?.deletedCount || 0),
      deletedImageHistoryCount: Number(imageHistoryResult?.deletedCount || 0),
      deletedImageHistoryOssObjectCount: Number(deleteImageHistoryOssSummary?.deletedCount || 0),
      failedImageHistoryOssKeys: Array.isArray(deleteImageHistoryOssSummary?.failedKeys)
        ? deleteImageHistoryOssSummary.failedKeys
        : [],
    });
  });
}
