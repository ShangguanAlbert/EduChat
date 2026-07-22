import { AGENT_META } from "../../../pages/chat/constants.js";
import {
  PACKYCODE_DEFAULT_MODEL,
  PACKYCODE_PROVIDER,
  resolveProviderDefaultModel,
} from "../../../pages/chat/agentRuntimeConfig.js";
import {
  buildApiMessages,
  buildSessionRenameAnswer,
  buildSessionRenameQuestion,
  buildStagedPreviewItem,
  fallbackSessionTitleFromQuestion,
  isUntitledSessionTitle,
  normalizeSuggestedSessionTitle,
  pickRecentRounds,
} from "./ChatConversationService.js";

const DEFAULT_CONTEXT_USER_ROUNDS = 10;
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);

function stripIndexedItem(item) {
  if (!item || typeof item !== "object") return item;
  const { index, ...rest } = item;
  void index;
  return rest;
}

function sanitizeProvider(value, fallback = "packycode") {
  const key = String(value || "").trim().toLowerCase();
  if (
    key === "packycode" ||
    key === "packy" ||
    key === "volcengine" ||
    key === "aliyun" ||
    key === "reserved"
  ) {
    if (key === "packy") return "packycode";
    return key;
  }
  if (key === "packyapi") {
    return "packycode";
  }
  if (key === "volc" || key === "ark") {
    return "volcengine";
  }
  if (key === "dashscope" || key === "alibaba") {
    return "aliyun";
  }
  return fallback;
}

export function resolveAgentProvider(agentId, runtimeConfig, providerDefaults, lockedProvider = "") {
  const safeAgentId = AGENT_META[agentId] ? agentId : "A";
  if (safeAgentId === "C" && lockedProvider) {
    return lockedProvider;
  }
  const runtimeProvider = String(runtimeConfig?.provider || "").trim().toLowerCase();
  if (runtimeProvider && runtimeProvider !== "inherit") {
    return sanitizeProvider(runtimeProvider, "packycode");
  }
  return sanitizeProvider(providerDefaults?.[safeAgentId], "packycode");
}

export function resolveRuntimeModelForProvider(agentId, runtimeConfig, providerDefaults, lockedProvider = "") {
  const provider = resolveAgentProvider(agentId, runtimeConfig, providerDefaults, lockedProvider);
  const explicitModel = String(runtimeConfig?.model || "").trim();
  if (explicitModel) return explicitModel;
  return resolveProviderDefaultModel(provider, agentId);
}

export function isPackyTokenBudgetRuntime(agentId, runtimeConfig, providerDefaults) {
  const provider = resolveAgentProvider(agentId, runtimeConfig, providerDefaults);
  if (provider !== PACKYCODE_PROVIDER) return false;
  const model = String(
    resolveRuntimeModelForProvider(agentId, runtimeConfig, providerDefaults) || "",
  )
    .trim()
    .toLowerCase();
  return !model || model === PACKYCODE_DEFAULT_MODEL;
}

export function shouldUseVolcengineFilesApi(agentId, runtimeConfig, providerDefaults) {
  const provider = resolveAgentProvider(agentId, runtimeConfig, providerDefaults);
  const protocol = String(runtimeConfig?.protocol || "").trim().toLowerCase();
  return provider === "volcengine" && protocol === "responses";
}

function classifyVolcengineFilesApiType(file) {
  const mime = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").trim().toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";

  if (mime.includes("pdf") || ext === "pdf") return "input_file";
  if (mime.startsWith("image/")) return "input_image";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "input_video";
  return "";
}

function isPdfUploadFile(file) {
  const mime = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").trim().toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return mime.includes("pdf") || ext === "pdf";
}

function isPreviewableUploadFile(file, classifyUploadPreviewKind) {
  return !!classifyUploadPreviewKind(file);
}

async function buildPreviewAwareLocalItems(indexedItems, deps) {
  const safeIndexedItems = Array.isArray(indexedItems) ? indexedItems.filter(Boolean) : [];
  const previewableCandidates = safeIndexedItems.filter((item) =>
    isPreviewableUploadFile(item.file, deps.classifyUploadPreviewKind),
  );
  const plainLocalCandidates = safeIndexedItems.filter(
    (item) => !isPreviewableUploadFile(item.file, deps.classifyUploadPreviewKind),
  );
  const localItems = await Promise.all(
    plainLocalCandidates.map(async (item) => ({
      index: item.index,
      kind: "local",
      file: item.file,
      name: String(item.file?.name || ""),
      size: Number(item.file?.size || 0),
      type: String(item.file?.type || ""),
      thumbnailUrl: await deps.buildImageThumbnailDataUrl(item.file),
    })),
  );
  const stagedPreviewItems = [];
  if (previewableCandidates.length > 0) {
    const stagedResult = await deps.stageChatPreviewAttachments({
      files: previewableCandidates.map((item) => item.file),
      sessionId: deps.sessionId,
    });
    const stagedRefs = Array.isArray(stagedResult?.files) ? stagedResult.files : [];
    if (stagedRefs.length !== previewableCandidates.length) {
      throw new Error("文档预览暂存结果异常，请重新上传。");
    }
    stagedRefs.forEach((ref, index) => {
      stagedPreviewItems.push({
        index: previewableCandidates[index].index,
        ...buildStagedPreviewItem(previewableCandidates[index].file, ref),
      });
    });
  }
  return [...localItems, ...stagedPreviewItems];
}

export async function prepareComposerFiles({
  pickedFiles = [],
  agentId = "A",
  sessionId = "",
  runtimeConfig = {},
  providerDefaults = {},
  deps,
} = {}) {
  const safePicked = Array.isArray(pickedFiles) ? pickedFiles.filter(Boolean) : [];
  if (safePicked.length === 0) return [];

  const serviceDeps = {
    buildImageThumbnailDataUrl: deps.buildImageThumbnailDataUrl,
    stageChatPreviewAttachments: deps.stageChatPreviewAttachments,
    prepareChatAttachments: deps.prepareChatAttachments,
    uploadVolcengineChatFiles: deps.uploadVolcengineChatFiles,
    classifyUploadPreviewKind: deps.classifyUploadPreviewKind,
    sessionId,
  };

  const shouldUseAliyunPdfPreprocess = () =>
    resolveAgentProvider(agentId, runtimeConfig, providerDefaults) === "aliyun" &&
    String(agentId || "").trim().toUpperCase() === "D";

  if (shouldUseAliyunPdfPreprocess()) {
    const indexedPicked = safePicked.map((file, index) => ({
      index,
      file,
      isPdf: isPdfUploadFile(file),
    }));
    const pdfCandidates = indexedPicked.filter((item) => item.isPdf);
    const localItems = await buildPreviewAwareLocalItems(
      indexedPicked.filter((item) => !item.isPdf),
      serviceDeps,
    );

    if (pdfCandidates.length > 0) {
      const prepareResult = await serviceDeps.prepareChatAttachments({
        agentId,
        sessionId,
        files: pdfCandidates.map((item) => item.file),
      });
      const preparedRefs = Array.isArray(prepareResult?.files) ? prepareResult.files : [];
      if (preparedRefs.length !== pdfCandidates.length) {
        throw new Error("PDF 预处理结果异常，请重新上传。");
      }

      const preparedItems = preparedRefs.map((ref, index) => {
        const file = pdfCandidates[index].file;
        const preparedToken = String(ref?.token || "").trim();
        if (!preparedToken) {
          throw new Error("PDF 预处理缺少 token，请重新上传。");
        }
        return {
          index: pdfCandidates[index].index,
          kind: "prepared_ref",
          file,
          name: String(file?.name || ref?.fileName || ""),
          size: Number(ref?.size || file?.size || 0),
          type: String(ref?.mimeType || file?.type || ""),
          mimeType: String(ref?.mimeType || file?.type || ""),
          url: String(ref?.url || "").trim(),
          ossKey: String(ref?.ossKey || "").trim(),
          preparedToken,
        };
      });

      return [...localItems, ...preparedItems]
        .sort((left, right) => left.index - right.index)
        .map(stripIndexedItem);
    }

    return localItems.sort((left, right) => left.index - right.index).map(stripIndexedItem);
  }

  if (!shouldUseVolcengineFilesApi(agentId, runtimeConfig, providerDefaults)) {
    const indexedPicked = safePicked.map((file, index) => ({ index, file }));
    const localItems = await buildPreviewAwareLocalItems(indexedPicked, serviceDeps);
    return localItems.sort((left, right) => left.index - right.index).map(stripIndexedItem);
  }

  const indexedPicked = safePicked.map((file, index) => ({
    index,
    file,
    inputType: classifyVolcengineFilesApiType(file),
  }));
  const remoteCandidates = indexedPicked.filter((item) => !!item.inputType);
  const localCandidates = indexedPicked.filter((item) => !item.inputType);
  const localItems = await buildPreviewAwareLocalItems(localCandidates, serviceDeps);

  if (remoteCandidates.length === 0) {
    return localItems.sort((left, right) => left.index - right.index);
  }

  const uploadResult = await serviceDeps.uploadVolcengineChatFiles({
    agentId,
    files: remoteCandidates.map((item) => item.file),
  });
  const remoteRefs = Array.isArray(uploadResult?.files) ? uploadResult.files : [];
  if (remoteRefs.length !== remoteCandidates.length) {
    throw new Error("文件上传结果异常，请重试。");
  }

  const remoteItems = await Promise.all(
    remoteRefs.map(async (ref, index) => ({
      index: remoteCandidates[index].index,
      kind: "volc_ref",
      file: remoteCandidates[index].file,
      name: String(remoteCandidates[index].file?.name || ref?.name || ""),
      size: Number(ref?.size || remoteCandidates[index].file?.size || 0),
      type: String(ref?.mimeType || remoteCandidates[index].file?.type || ""),
      mimeType: String(ref?.mimeType || remoteCandidates[index].file?.type || ""),
      inputType: String(ref?.inputType || remoteCandidates[index].inputType || ""),
      fileId: String(ref?.fileId || ""),
      url: String(ref?.url || "").trim(),
      ossKey: String(ref?.ossKey || "").trim(),
      thumbnailUrl: await serviceDeps.buildImageThumbnailDataUrl(remoteCandidates[index].file),
    })),
  );

  return [...localItems, ...remoteItems]
    .sort((left, right) => left.index - right.index)
    .map(stripIndexedItem);
}

export function buildHistoryForApi({
  history = [],
  agentId = "A",
  runtimeConfig = {},
  providerDefaults = {},
  contextRounds = DEFAULT_CONTEXT_USER_ROUNDS,
} = {}) {
  const usePackyContextSummary = isPackyTokenBudgetRuntime(agentId, runtimeConfig, providerDefaults);
  const narrowedHistory = usePackyContextSummary
    ? history
    : pickRecentRounds(history, runtimeConfig.contextRounds || contextRounds);

  return buildApiMessages(narrowedHistory, {
    useVolcengineResponsesFileRefs: shouldUseVolcengineFilesApi(
      agentId,
      runtimeConfig,
      providerDefaults,
    ),
    usePackyContextSummary,
  });
}

export async function suggestSessionTitleForExchange({
  userMessage,
  assistantMessage,
  suggestTitle,
} = {}) {
  const question = buildSessionRenameQuestion(userMessage);
  const answer = buildSessionRenameAnswer(assistantMessage);
  if (!question || !answer) {
    return "";
  }

  try {
    const result = await suggestTitle({
      question,
      answer,
    });
    return normalizeSuggestedSessionTitle(result?.title, fallbackSessionTitleFromQuestion(question));
  } catch {
    return fallbackSessionTitleFromQuestion(question);
  }
}

export const ChatSessionService = {
  buildHistoryForApi,
  isPackyTokenBudgetRuntime,
  isUntitledSessionTitle,
  normalizeSuggestedSessionTitle,
  prepareComposerFiles,
  resolveAgentProvider,
  shouldUseVolcengineFilesApi,
  suggestSessionTitleForExchange,
};
