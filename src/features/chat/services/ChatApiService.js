import {
  getAuthTokenHeader,
  prepareChatAttachments,
  reportChatClientDebug,
  stageChatPreviewAttachments,
  suggestChatSessionTitle,
  uploadVolcengineChatFiles,
} from "../api/chatApi.js";
import { readErrorMessage, readSseStream } from "../../../pages/chat/chatHelpers.js";

export function buildChatStreamEndpoint(agentId) {
  void agentId;
  return "/api/chat/stream";
}

export function createChatStreamFormData({
  agentId = "A",
  runtimeConfig = {},
  sessionId = "",
  smartContextEnabled = false,
  contextMode = "append",
  messages = [],
  localFiles = [],
  volcengineFileRefs = [],
  preparedAttachmentRefs = [],
  stagedAttachmentRefs = [],
  selectedContextDocuments = [],
} = {}) {
  const formData = new FormData();
  formData.append("agentId", String(agentId || "A"));
  formData.append("temperature", String(runtimeConfig.temperature));
  formData.append("topP", String(runtimeConfig.topP));
  formData.append("sessionId", String(sessionId || "").trim());
  formData.append("smartContextEnabled", String(!!smartContextEnabled));
  formData.append("contextMode", String(contextMode || "append"));
  formData.append("messages", JSON.stringify(Array.isArray(messages) ? messages : []));

  (Array.isArray(localFiles) ? localFiles : []).forEach((file) => formData.append("files", file));
  if (Array.isArray(volcengineFileRefs) && volcengineFileRefs.length > 0) {
    formData.append("volcengineFileRefs", JSON.stringify(volcengineFileRefs));
  }
  if (Array.isArray(preparedAttachmentRefs) && preparedAttachmentRefs.length > 0) {
    formData.append("preparedAttachmentRefs", JSON.stringify(preparedAttachmentRefs));
  }
  if (Array.isArray(stagedAttachmentRefs) && stagedAttachmentRefs.length > 0) {
    formData.append("stagedAttachmentRefs", JSON.stringify(stagedAttachmentRefs));
  }
  if (Array.isArray(selectedContextDocuments) && selectedContextDocuments.length > 0) {
    formData.append(
      "selectedContextFiles",
      JSON.stringify(
        selectedContextDocuments.map((item) => ({
          key: item.key,
          messageId: item.messageId,
          attachmentIndex: item.attachmentIndex,
          name: item.name,
          type: item.mimeType,
          fileId: item.fileId,
          inputType: item.inputType,
          kind: item.kind,
        })),
      ),
    );
  }

  return formData;
}

export async function streamChatCompletion({
  agentId = "A",
  formData,
  signal,
  handlers = {},
} = {}) {
  const endpoint = buildChatStreamEndpoint(agentId);
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...getAuthTokenHeader(),
    },
    body: formData,
    signal,
  });

  if (!resp.ok || !resp.body) {
    const errText = await readErrorMessage(resp);
    throw new Error(errText || `HTTP ${resp.status}`);
  }

  await readSseStream(resp, handlers);
}

export const ChatApiService = {
  buildChatStreamEndpoint,
  createChatStreamFormData,
  streamChatCompletion,
  prepareChatAttachments,
  stageChatPreviewAttachments,
  uploadVolcengineChatFiles,
  suggestChatSessionTitle,
  reportChatClientDebug,
};
