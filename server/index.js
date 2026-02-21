import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import http from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile as readFileAsync, rm, writeFile as writeFileAsync } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mammoth from "mammoth";
import XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import mongoose from "mongoose";
import OSS from "ali-oss";
import { WebSocketServer } from "ws";
import { SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT } from "./prompts/leakProtectionPrompt.js";
import { PROMPT_LEAK_PROBE_KEYWORDS } from "./prompts/leakProtectionKeywords.js";
import {
  AGENT_E_CONFIG_KEY,
  AGENT_E_FIXED_PROVIDER,
  AGENT_E_ID,
} from "./agent-e/constants.js";
import {
  buildAgentEAdminSettingsResponse,
  createAgentEConfigModel,
  normalizeAgentEConfigDoc,
  sanitizeAgentEConfigPayload,
  sanitizeAgentERuntime,
} from "./agent-e/config.js";
import { selectAgentESkills } from "./agent-e/skills/registry.js";
import { buildAgentESystemPrompt } from "./agent-e/promptComposer.js";
import {
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
} from "./providers/aliyun/index.js";
import {
  ALIYUN_SEARCH_CITATION_FORMATS,
  ALIYUN_SEARCH_FRESHNESS_OPTIONS,
  ALIYUN_SEARCH_STRATEGIES,
} from "./providers/aliyun/constants.js";

dotenv.config();

const app = express();
const groupChatWsRoomSockets = new Map();
const groupChatWsMetaBySocket = new Map();
const groupChatWsOnlineCountsByRoom = new Map();
const chatPreparedAttachmentCache = new Map();
let groupChatExpiredFileCleanupTimer = null;
let generatedImageExpiredCleanupTimer = null;
const port = process.env.PORT || 8787;
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/educhat";
const authSecret = String(
  process.env.AUTH_SECRET || "educhat-dev-secret-change-this-secret",
).trim();
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 - 1; // strictly < 10MB
const MAX_FILES = 8;
const CHAT_PREPARED_ATTACHMENT_CACHE_TTL_MS = 45 * 60 * 1000;
const CHAT_PREPARED_ATTACHMENT_CACHE_MAX_ITEMS = 320;
const CHAT_PREPARED_ATTACHMENT_MAX_REFS = MAX_FILES;
const MAX_IMAGE_GENERATION_INPUT_FILES = 14;
const MAX_PARSED_CHARS_PER_FILE = 12000;
const ALIYUN_DASHSCOPE_PARSED_DOC_MAX_CHARS = 48000;
const EXCEL_PREVIEW_MAX_ROWS = 120;
const EXCEL_PREVIEW_MAX_COLS = 30;
const EXCEL_PREVIEW_MAX_SHEETS = 8;
const PASSWORD_MIN_LENGTH = 6;
const AUTH_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const ADMIN_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const AGENT_IDS = ["A", "B", "C", "D"];
const ADMIN_CONFIG_KEY = "global";
const DEFAULT_VOLCENGINE_IMAGE_GENERATION_MODEL = "doubao-seedream-4-5-251128";
const DEFAULT_VOLCENGINE_IMAGE_GENERATION_ENDPOINT =
  "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const SYSTEM_PROMPT_MAX_LENGTH = 24000;
const DEFAULT_SYSTEM_PROMPT_FALLBACK = "你是用户的助手";
const RUNTIME_CONTEXT_ROUNDS_MAX = 20;
const RUNTIME_MAX_CONTEXT_WINDOW_TOKENS = 512000;
const RUNTIME_MAX_INPUT_TOKENS = 512000;
const RUNTIME_MAX_OUTPUT_TOKENS = 1048576;
const RUNTIME_MAX_REASONING_TOKENS = 128000;
const VOLCENGINE_FIXED_SAMPLING_MODEL_ID = "doubao-seed-2-0-pro-260215";
const VOLCENGINE_FIXED_TEMPERATURE = 1;
const VOLCENGINE_FIXED_TOP_P = 0.95;
const UPLOADED_FILE_CONTEXT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GENERATED_IMAGE_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GENERATED_IMAGE_HISTORY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GENERATED_IMAGE_HISTORY_FETCH_TIMEOUT_MS = 15 * 1000;
const GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER = 2;
const GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER = 8;
const GROUP_CHAT_MAX_MEMBERS_PER_ROOM = 5;
const GROUP_CHAT_MAX_ROOMS_PER_BOOTSTRAP = 16;
const GROUP_CHAT_DEFAULT_MESSAGES_LIMIT = 80;
const GROUP_CHAT_MAX_MESSAGES_LIMIT = 200;
const GROUP_CHAT_IMAGE_MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;
const GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const GROUP_CHAT_FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GROUP_CHAT_OSS_DEFAULT_REGION = "oss-cn-hangzhou";
const GROUP_CHAT_OSS_DEFAULT_PREFIX = "chat-files";
const GROUP_CHAT_OSS_SIGNED_URL_TTL_SECONDS_DEFAULT = 300;
const GROUP_CHAT_OSS_SIGNED_URL_TTL_SECONDS_MAX = 3600;
const GROUP_CHAT_OSS_STARTUP_CHECK_TIMEOUT_MS_DEFAULT = 8000;
const GROUP_CHAT_OSS_STARTUP_CHECK_TIMEOUT_MS_MAX = 60000;
const GROUP_CHAT_OSS_EXPIRED_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const GROUP_CHAT_OSS_EXPIRED_CLEANUP_BATCH_SIZE = 120;
const GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_INTERVAL_MS = 60 * 1000;
const GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_BATCH_SIZE = 80;
const CHAT_ATTACHMENT_OSS_SCOPE = "chat-attachments";
const CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE = "chat-prepared-pdf-images";
const IMAGE_GENERATION_INPUT_OSS_SCOPE = "image-generation-inputs";
const IMAGE_GENERATION_OUTPUT_OSS_SCOPE = "image-generation-outputs";
const ALIYUN_DASHSCOPE_PDF_IMAGE_MAX_PAGES = 50;
const ALIYUN_DASHSCOPE_PDF_RENDER_DPI = 300;
const ALIYUN_DASHSCOPE_PDF_RENDER_TIMEOUT_MS = 180 * 1000;
const ALIYUN_DASHSCOPE_PDF_RENDER_STDOUT_MAX_BYTES = 1024 * 1024;
const ALIYUN_DASHSCOPE_PDF_RENDER_SCRIPT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "aliyun_pdf_to_images.py",
);
const GROUP_CHAT_TEXT_MAX_LENGTH = 1800;
const GROUP_CHAT_ROOM_NAME_MAX_LENGTH = 30;
const GROUP_CHAT_REPLY_PREVIEW_MAX_LENGTH = 120;
const GROUP_CHAT_LOCAL_PARSE_HINT_TEXT = "仅解析文字中的文本";
const GROUP_CHAT_MAX_REACTIONS_PER_MESSAGE = 32;
const GROUP_CHAT_REACTION_EMOJI_MAX_SYMBOLS = 6;
const GROUP_CHAT_MAX_READ_STATES_PER_ROOM = GROUP_CHAT_MAX_MEMBERS_PER_ROOM;
const GROUP_CHAT_WS_PATH = "/ws/group-chat";
const GROUP_CHAT_WS_AUTH_TIMEOUT_MS = 10000;
const GROUP_CHAT_WS_MAX_PAYLOAD_BYTES = 128 * 1024;
const groupChatOssConfig = buildGroupChatOssConfig();
const groupChatOssClients = createGroupChatOssClients(groupChatOssConfig);
const groupChatOssClient = groupChatOssClients.primary;
const groupChatOssFallbackClient = groupChatOssClients.fallback;
if (!groupChatOssClient) {
  console.warn(
    "[group-chat-file-storage] OSS 未启用，群聊文件将继续写入 MongoDB（Buffer）。",
  );
} else if (groupChatOssConfig?.networkMode === "internal_prefer" && groupChatOssFallbackClient) {
  const fallbackHost =
    groupChatOssFallbackClient?.options?.endpoint?.host ||
    groupChatOssFallbackClient?.options?.endpoint?.hostname ||
    "";
  console.log(
    `[group-chat-file-storage] OSS 已启用：优先走内网；若连接超时将自动回退公网重试（fallback=${fallbackHost || "public-endpoint"}）。`,
  );
} else if (groupChatOssConfig?.networkMode === "internal_prefer") {
  console.log("[group-chat-file-storage] OSS 已启用：优先走内网（公网回退未启用）。");
} else if (groupChatOssConfig?.networkMode === "internal_only") {
  console.log("[group-chat-file-storage] OSS 已启用：仅走内网（不回退公网）。");
} else {
  console.log("[group-chat-file-storage] OSS 已启用：仅走公网。");
}
const AGENT_D_FIXED_PROVIDER = "aliyun";
const AGENT_D_FIXED_MODEL = "qwen3.5-plus";
const AGENT_D_FIXED_MAX_OUTPUT_TOKENS = 65536;
const GROUP_CHAT_VOLCENGINE_SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
  "ico",
  "icns",
  "sgi",
  "jp2",
  "heic",
  "heif",
]);
const GROUP_CHAT_VOLCENGINE_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/x-icon",
  "image/icns",
  "image/sgi",
  "image/jp2",
  "image/heic",
  "image/heif",
]);

const DEFAULT_AGENT_RUNTIME_CONFIG = Object.freeze({
  provider: "inherit",
  model: "",
  protocol: "chat",
  creativityMode: "balanced",
  temperature: 0.6,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  contextRounds: 10,
  contextWindowTokens: 128000,
  maxInputTokens: 96000,
  maxOutputTokens: 4096,
  maxReasoningTokens: 0,
  enableThinking: true,
  thinkingEffort: "high",
  includeCurrentTime: false,
  preventPromptLeak: false,
  injectSafetyPrompt: false,
  enableWebSearch: false,
  webSearchMaxKeyword: 2,
  webSearchResultLimit: 10,
  webSearchMaxToolCalls: 3,
  webSearchSourceDouyin: true,
  webSearchSourceMoji: true,
  webSearchSourceToutiao: true,
  aliyunThinkingBudget: 0,
  aliyunSearchForced: false,
  aliyunSearchStrategy: "turbo",
  aliyunSearchEnableSource: false,
  aliyunSearchEnableCitation: false,
  aliyunSearchCitationFormat: "[<number>]",
  aliyunSearchEnableSearchExtension: false,
  aliyunSearchPrependSearchResult: false,
  aliyunSearchFreshness: 0,
  aliyunSearchAssignedSiteList: [],
  aliyunSearchPromptIntervene: "",
  aliyunResponsesEnableWebExtractor: false,
  aliyunResponsesEnableCodeInterpreter: false,
  aliyunFileProcessMode: "local_parse",
  openrouterPreset: "",
  openrouterIncludeReasoning: false,
  openrouterUseWebPlugin: false,
  openrouterWebPluginEngine: "auto",
  openrouterWebPluginMaxResults: 5,
  openrouterUseResponseHealing: false,
  openrouterPdfEngine: "auto",
});
const AGENT_RUNTIME_DEFAULT_OVERRIDES = Object.freeze({
  A: Object.freeze({
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 64000,
    maxReasoningTokens: 32000,
  }),
  B: Object.freeze({
    contextWindowTokens: 200000,
    maxInputTokens: 200000,
    maxOutputTokens: 128000,
    maxReasoningTokens: 128000,
  }),
  C: Object.freeze({
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  }),
  D: Object.freeze({
    provider: AGENT_D_FIXED_PROVIDER,
    model: AGENT_D_FIXED_MODEL,
    includeCurrentTime: true,
    maxOutputTokens: AGENT_D_FIXED_MAX_OUTPUT_TOKENS,
    enableWebSearch: true,
    aliyunSearchEnableSource: false,
    aliyunSearchEnableSearchExtension: true,
    aliyunResponsesEnableWebExtractor: true,
    aliyunResponsesEnableCodeInterpreter: true,
  }),
});
const AGENT_RUNTIME_DEFAULTS = Object.freeze({
  A: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.A,
  }),
  B: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.B,
  }),
  C: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.C,
  }),
  D: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.D,
  }),
});
const RESPONSE_MODEL_TOKEN_PROFILES = Object.freeze([
  {
    id: "doubao-seed-2-0-pro-260215",
    aliases: [
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-pro",
      "doubao-seed-2.0-pro-260215",
      "doubao-seed-2.0-pro",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 256000,
    maxOutputTokens: 131072,
    maxReasoningTokens: 131072,
  },
  {
    id: "doubao-seed-2-0-lite-260215",
    aliases: [
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-2-0-lite",
      "doubao-seed-2.0-lite-260215",
      "doubao-seed-2.0-lite",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32768,
    maxReasoningTokens: 32768,
  },
  {
    id: "doubao-seed-2-0-mini-260215",
    aliases: [
      "doubao-seed-2-0-mini-260215",
      "doubao-seed-2-0-mini",
      "doubao-seed-2.0-mini-260215",
      "doubao-seed-2.0-mini",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32768,
    maxReasoningTokens: 32768,
  },
  {
    id: "doubao-seed-1-8-251228",
    aliases: ["doubao-seed-1-8-251228", "doubao-seed-1-8"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-251015",
    aliases: ["doubao-seed-1-6-251015", "doubao-seed-1-6"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 64000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-250615",
    aliases: ["doubao-seed-1-6-250615"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-lite-251015",
    aliases: ["doubao-seed-1-6-lite-251015", "doubao-seed-1-6-lite"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-flash-250828",
    aliases: [
      "doubao-seed-1-6-flash-250828",
      "doubao-seed-1-6-flash-250715",
      "doubao-seed-1-6-flash-250615",
      "doubao-seed-1-6-flash",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-vision-250815",
    aliases: ["doubao-seed-1-6-vision-250815", "doubao-seed-1-6-vision"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-thinking-250715",
    aliases: [
      "doubao-seed-1-6-thinking-250715",
      "doubao-seed-1-6-thinking-250615",
      "doubao-seed-1-6-thinking",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-code-preview-251028",
    aliases: ["doubao-seed-code-preview-251028", "doubao-seed-code"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "glm-4-7-251222",
    aliases: ["glm-4-7-251222", "glm-4-7"],
    contextWindowTokens: 200000,
    maxInputTokens: 200000,
    maxOutputTokens: 128000,
    maxReasoningTokens: 128000,
  },
  {
    id: "deepseek-v3-2-251201",
    aliases: ["deepseek-v3-2-251201", "deepseek-v3-2"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "deepseek-v3-1-terminus",
    aliases: ["deepseek-v3-1-terminus", "deepseek-v3-1"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "deepseek-v3-1-250821",
    aliases: ["deepseek-v3-1-250821"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "deepseek-v3-250324",
    aliases: ["deepseek-v3-250324", "deepseek-v3"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 0,
  },
  {
    id: "deepseek-r1-250528",
    aliases: ["deepseek-r1-250528", "deepseek-r1"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "kimi-k2.5",
    aliases: ["kimi-k2.5", "kimi-2.5"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32768,
    maxReasoningTokens: 32000,
  },
  {
    id: "kimi-k2-thinking-251104",
    aliases: ["kimi-k2-thinking-251104", "kimi-k2-thinking"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "kimi-k2-250905",
    aliases: ["kimi-k2-250905", "kimi-k2"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-thinking-pro-250415",
    aliases: ["doubao-1-5-thinking-pro-250415", "doubao-1-5-thinking-pro"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-thinking-pro-m-250428",
    aliases: ["doubao-1-5-thinking-pro-m-250428", "doubao-1-5-thinking-pro-m"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-thinking-vision-pro-250428",
    aliases: [
      "doubao-1-5-thinking-vision-pro-250428",
      "doubao-1-5-thinking-vision-pro",
    ],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-ui-tars-250428",
    aliases: ["doubao-1-5-ui-tars-250428", "doubao-1-5-ui-tars"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-vision-pro-250328",
    aliases: ["doubao-1-5-vision-pro-250328", "doubao-1-5-vision-pro"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-pro-32k-250115",
    aliases: ["doubao-1-5-pro-32k-250115", "doubao-1-5-pro-32k"],
    contextWindowTokens: 128000,
    maxInputTokens: 128000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-lite-32k-250115",
    aliases: ["doubao-1-5-lite-32k-250115", "doubao-1-5-lite-32k"],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 12000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-pro-32k-character-250715",
    aliases: [
      "doubao-1-5-pro-32k-character-250715",
      "doubao-1-5-pro-32k-character-250228",
      "doubao-1-5-pro-32k-character",
    ],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 12000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-vision-pro-32k-250115",
    aliases: ["doubao-1-5-vision-pro-32k-250115", "doubao-1-5-vision-pro-32k"],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 12000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-vision-lite-250315",
    aliases: ["doubao-1-5-vision-lite-250315", "doubao-1-5-vision-lite"],
    contextWindowTokens: 128000,
    maxInputTokens: 128000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-lite-32k-character-250228",
    aliases: ["doubao-lite-32k-character-250228", "doubao-lite-32k-character"],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 4000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-seed-translation-250915",
    aliases: ["doubao-seed-translation-250915", "doubao-seed-translation"],
    contextWindowTokens: 4000,
    maxInputTokens: 1000,
    maxOutputTokens: 3000,
    maxReasoningTokens: 0,
  },
]);
const VOLCENGINE_WEB_SEARCH_MODEL_CAPABILITIES = Object.freeze([
  {
    id: "doubao-seed-2-0-pro-260215",
    aliases: [
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-pro",
      "doubao-seed-2.0-pro-260215",
      "doubao-seed-2.0-pro",
    ],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-2-0-lite-260215",
    aliases: [
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-2-0-lite",
      "doubao-seed-2.0-lite-260215",
      "doubao-seed-2.0-lite",
    ],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-2-0-mini-260215",
    aliases: [
      "doubao-seed-2-0-mini-260215",
      "doubao-seed-2-0-mini",
      "doubao-seed-2.0-mini-260215",
      "doubao-seed-2.0-mini",
    ],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-1-8-251228",
    aliases: ["doubao-seed-1-8-251228", "doubao-seed-1-8"],
    supportsThinking: true,
  },
  {
    id: "deepseek-v3-2-251201",
    aliases: ["deepseek-v3-2-251201", "deepseek-v3-2"],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-1-6-251015",
    aliases: ["doubao-seed-1-6-251015", "doubao-seed-1-6-250615", "doubao-seed-1-6"],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-1-6-thinking-250715",
    aliases: ["doubao-seed-1-6-thinking-250715", "doubao-seed-1-6-thinking"],
    supportsThinking: true,
  },
  {
    id: "deepseek-v3-1-terminus",
    aliases: ["deepseek-v3-1-terminus", "deepseek-v3-1-250821", "deepseek-v3-1"],
    supportsThinking: true,
  },
  {
    id: "kimi-k2-thinking-251104",
    aliases: ["kimi-k2-thinking-251104"],
    supportsThinking: true,
  },
  {
    id: "kimi-k2-250905",
    aliases: ["kimi-k2-250905", "kimi-k2"],
    supportsThinking: false,
  },
]);
const VOLCENGINE_WEB_SEARCH_THINKING_PROMPT = [
  "你需要在回答过程中执行“边想边搜”策略：当问题涉及时效性、知识盲区或信息不足时，优先调用 web_search 工具补充信息。",
  "在思考中明确说明：是否需要搜索、为什么搜索、计划使用的关键词。",
  "回答应优先依据搜索结果，并在正文中标注可追溯来源。",
].join("\n");

function getDefaultRuntimeConfigByAgent(agentId = "A") {
  const key = AGENT_IDS.includes(agentId) ? agentId : "A";
  return AGENT_RUNTIME_DEFAULTS[key] || AGENT_RUNTIME_DEFAULTS.A;
}

function createDefaultAgentRuntimeConfigMap() {
  const next = {};
  AGENT_IDS.forEach((agentId) => {
    next[agentId] = { ...getDefaultRuntimeConfigByAgent(agentId) };
  });
  return next;
}

const scryptAsync = promisify(crypto.scrypt);
const execFileAsync = promisify(execFile);
const CRC32_TABLE = createCrc32Table();

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "c",
  "h",
  "cc",
  "hh",
  "cpp",
  "hpp",
  "cxx",
  "hxx",
  "py",
  "python",
  "xml",
  "json",
  "yaml",
  "yml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "java",
  "go",
  "rs",
  "sh",
  "bash",
  "zsh",
  "sql",
  "html",
  "css",
  "scss",
  "less",
  "csv",
  "tsv",
  "toml",
  "ini",
  "log",
  "tex",
  "r",
  "rb",
  "php",
  "swift",
  "kt",
  "m",
  "mm",
  "vue",
  "svelte",
]);

const WORD_EXTENSIONS = new Set(["docx", "doc"]);
const EXCEL_EXTENSIONS = new Set(["xlsx", "xls"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);
const OPENROUTER_VIDEO_EXTENSIONS = new Set(["mp4", "mpeg", "mov", "webm"]);
const OPENROUTER_AUDIO_FORMATS = new Set([
  "wav",
  "mp3",
  "aiff",
  "aac",
  "ogg",
  "flac",
  "m4a",
  "pcm16",
  "pcm24",
]);
const OPENROUTER_AUDIO_EXTENSIONS = new Set([
  "wav",
  "mp3",
  "aiff",
  "aac",
  "ogg",
  "flac",
  "m4a",
  "pcm16",
  "pcm24",
]);
const OPENROUTER_AUDIO_MIME_TO_FORMAT = Object.freeze({
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_FILES, fileSize: MAX_FILE_SIZE_BYTES },
});
const imageGenerationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_IMAGE_GENERATION_INPUT_FILES,
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});
const groupChatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: GROUP_CHAT_IMAGE_MAX_FILE_SIZE_BYTES,
  },
});
const groupChatFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
  },
});

const authUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    usernameKey: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    passwordHash: { type: String, required: true },
    // NOTE: 仅用于本地教学演示的管理员导出功能，不建议在生产场景保存明文密码。
    passwordPlain: { type: String, required: true },
    profile: {
      name: { type: String, default: "" },
      studentId: { type: String, default: "" },
      gender: { type: String, default: "" },
      grade: { type: String, default: "" },
      className: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
    collection: "auth_users",
  },
);

const AuthUser =
  mongoose.models.AuthUser || mongoose.model("AuthUser", authUserSchema);

const chatStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
      ref: "AuthUser",
    },
    activeId: { type: String, default: "s1" },
    groups: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            name: { type: String, required: true },
            description: { type: String, default: "" },
          },
          { _id: false },
        ),
      ],
      default: () => [],
    },
    sessions: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            title: { type: String, required: true },
            groupId: { type: String, default: "" },
            pinned: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: () => [],
    },
    sessionMessages: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    sessionContextRefs: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    settings: {
      type: new mongoose.Schema(
        {
          agent: { type: String, default: "A" },
          agentBySession: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
          },
          apiTemperature: { type: Number, default: 0.6 },
          apiTopP: { type: Number, default: 1 },
          apiReasoningEffort: { type: String, default: "high" },
          lastAppliedReasoning: { type: String, default: "high" },
          smartContextEnabled: { type: Boolean, default: false },
          smartContextEnabledBySessionAgent: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
          },
        },
        { _id: false },
      ),
      default: () => ({
        agent: "A",
        agentBySession: {},
        apiTemperature: 0.6,
        apiTopP: 1,
        apiReasoningEffort: "high",
        lastAppliedReasoning: "high",
        smartContextEnabled: false,
        smartContextEnabledBySessionAgent: {},
      }),
    },
  },
  {
    timestamps: true,
    collection: "chat_states",
  },
);

const ChatState =
  mongoose.models.ChatState || mongoose.model("ChatState", chatStateSchema);

const uploadedFileContextSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: "",
    },
    preparedAttachmentTokens: {
      type: [String],
      default: () => [],
    },
    ossFiles: {
      type: [
        new mongoose.Schema(
          {
            fileName: { type: String, default: "" },
            mimeType: { type: String, default: "application/octet-stream" },
            size: { type: Number, default: 0 },
            source: { type: String, default: "" },
            ossKey: { type: String, default: "" },
            ossBucket: { type: String, default: "" },
            ossRegion: { type: String, default: "" },
            fileUrl: { type: String, default: "" },
          },
          { _id: false },
        ),
      ],
      default: () => [],
    },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "uploaded_file_contexts",
    autoIndex: false,
  },
);
uploadedFileContextSchema.index(
  { userId: 1, sessionId: 1, messageId: 1 },
  { unique: true, name: "ux_uploaded_file_context_user_session_message" },
);
uploadedFileContextSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "ttl_uploaded_file_context_expires_at" },
);

const UploadedFileContext =
  mongoose.models.UploadedFileContext ||
  mongoose.model("UploadedFileContext", uploadedFileContextSchema);

const generatedImageHistorySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    prompt: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imageStorageType: { type: String, default: "remote" },
    ossKey: { type: String, default: "" },
    ossBucket: { type: String, default: "" },
    ossRegion: { type: String, default: "" },
    imageMimeType: { type: String, default: "" },
    imageSize: { type: Number, default: 0 },
    imageData: { type: Buffer, default: Buffer.alloc(0) },
    responseFormat: { type: String, default: "url" },
    size: { type: String, default: "" },
    model: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "generated_image_histories",
    autoIndex: false,
  },
);
generatedImageHistorySchema.index(
  { userId: 1, createdAt: -1 },
  { name: "ix_generated_image_histories_user_created_at_desc" },
);
generatedImageHistorySchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "ttl_generated_image_histories_expires_at" },
);

const GeneratedImageHistory =
  mongoose.models.GeneratedImageHistory ||
  mongoose.model("GeneratedImageHistory", generatedImageHistorySchema);

const groupChatRoomReadStateSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    lastReadMessageId: { type: String, default: "" },
    lastReadAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const groupChatRoomSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: String, required: true, index: true },
    memberUserIds: {
      type: [String],
      default: () => [],
    },
    memberCount: { type: Number, default: 1, min: 1 },
    readStates: {
      type: [groupChatRoomReadStateSchema],
      default: () => [],
    },
  },
  {
    timestamps: true,
    collection: "group_chat_rooms",
  },
);
groupChatRoomSchema.index(
  { memberUserIds: 1, updatedAt: -1 },
  { name: "ix_group_chat_rooms_member_updated_desc" },
);

const GroupChatRoom =
  mongoose.models.GroupChatRoom || mongoose.model("GroupChatRoom", groupChatRoomSchema);

const groupChatMessageReactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, default: "" },
    userId: { type: String, default: "" },
    userName: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const groupChatStoredFileSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    messageId: { type: String, default: "", index: true },
    uploaderUserId: { type: String, required: true, index: true },
    fileName: { type: String, default: "group-file.bin" },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    storageType: {
      type: String,
      enum: ["mongo", "oss"],
      default: "mongo",
    },
    ossKey: { type: String, default: "" },
    ossBucket: { type: String, default: "" },
    ossRegion: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    data: { type: Buffer, default: Buffer.alloc(0) },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "group_chat_files",
    autoIndex: false,
  },
);
groupChatStoredFileSchema.index(
  { roomId: 1, createdAt: -1 },
  { name: "ix_group_chat_files_room_created_desc" },
);
groupChatStoredFileSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "ttl_group_chat_files_expires_at" },
);

const GroupChatStoredFile =
  mongoose.models.GroupChatStoredFile ||
  mongoose.model("GroupChatStoredFile", groupChatStoredFileSchema);

const groupChatMessageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      required: true,
    },
    senderUserId: { type: String, default: "" },
    senderName: { type: String, default: "" },
    content: { type: String, default: "" },
    image: {
      type: new mongoose.Schema(
        {
          dataUrl: { type: String, default: "" },
          mimeType: { type: String, default: "" },
          fileName: { type: String, default: "" },
          size: { type: Number, default: 0 },
          filesApi: {
            type: new mongoose.Schema(
              {
                status: { type: String, default: "" },
                fileId: { type: String, default: "" },
                inputType: { type: String, default: "" },
                uploadedAt: { type: Date, default: null },
                expiresAt: { type: Date, default: null },
              },
              { _id: false },
            ),
            default: () => ({}),
          },
          oss: {
            type: new mongoose.Schema(
              {
                uploaded: { type: Boolean, default: false },
                ossKey: { type: String, default: "" },
                ossBucket: { type: String, default: "" },
                ossRegion: { type: String, default: "" },
                fileUrl: { type: String, default: "" },
              },
              { _id: false },
            ),
            default: () => ({}),
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    file: {
      type: new mongoose.Schema(
        {
          fileId: { type: String, default: "" },
          fileName: { type: String, default: "" },
          mimeType: { type: String, default: "" },
          size: { type: Number, default: 0 },
          expiresAt: { type: Date, default: null },
          localParseOnly: { type: Boolean, default: false },
          parseHint: { type: String, default: "" },
          filesApi: {
            type: new mongoose.Schema(
              {
                status: { type: String, default: "" },
                fileId: { type: String, default: "" },
                inputType: { type: String, default: "" },
                uploadedAt: { type: Date, default: null },
                expiresAt: { type: Date, default: null },
              },
              { _id: false },
            ),
            default: () => ({}),
          },
          oss: {
            type: new mongoose.Schema(
              {
                uploaded: { type: Boolean, default: false },
                ossKey: { type: String, default: "" },
                ossBucket: { type: String, default: "" },
                ossRegion: { type: String, default: "" },
                fileUrl: { type: String, default: "" },
              },
              { _id: false },
            ),
            default: () => ({}),
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    replyToMessageId: { type: String, default: "" },
    replyPreviewText: { type: String, default: "" },
    replySenderName: { type: String, default: "" },
    replyType: { type: String, default: "" },
    mentionNames: { type: [String], default: () => [] },
    reactions: {
      type: [groupChatMessageReactionSchema],
      default: () => [],
    },
  },
  {
    timestamps: true,
    collection: "group_chat_messages",
  },
);
groupChatMessageSchema.index(
  { roomId: 1, createdAt: -1 },
  { name: "ix_group_chat_messages_room_created_desc" },
);

const GroupChatMessage =
  mongoose.models.GroupChatMessage ||
  mongoose.model("GroupChatMessage", groupChatMessageSchema);

const runtimeConfigSchema = new mongoose.Schema(
  {
    provider: { type: String, default: DEFAULT_AGENT_RUNTIME_CONFIG.provider },
    model: { type: String, default: DEFAULT_AGENT_RUNTIME_CONFIG.model },
    protocol: { type: String, default: DEFAULT_AGENT_RUNTIME_CONFIG.protocol },
    creativityMode: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.creativityMode,
    },
    temperature: { type: Number, default: DEFAULT_AGENT_RUNTIME_CONFIG.temperature },
    topP: { type: Number, default: DEFAULT_AGENT_RUNTIME_CONFIG.topP },
    frequencyPenalty: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.frequencyPenalty,
    },
    presencePenalty: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.presencePenalty,
    },
    contextRounds: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.contextRounds,
    },
    contextWindowTokens: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.contextWindowTokens,
    },
    maxInputTokens: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.maxInputTokens,
    },
    maxOutputTokens: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.maxOutputTokens,
    },
    maxReasoningTokens: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.maxReasoningTokens,
    },
    enableThinking: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.enableThinking,
    },
    thinkingEffort: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.thinkingEffort,
    },
    includeCurrentTime: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.includeCurrentTime,
    },
    preventPromptLeak: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.preventPromptLeak,
    },
    injectSafetyPrompt: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.injectSafetyPrompt,
    },
    enableWebSearch: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.enableWebSearch,
    },
    webSearchMaxKeyword: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.webSearchMaxKeyword,
    },
    webSearchResultLimit: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.webSearchResultLimit,
    },
    webSearchMaxToolCalls: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.webSearchMaxToolCalls,
    },
    webSearchSourceDouyin: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.webSearchSourceDouyin,
    },
    webSearchSourceMoji: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.webSearchSourceMoji,
    },
    webSearchSourceToutiao: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.webSearchSourceToutiao,
    },
    aliyunThinkingBudget: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunThinkingBudget,
    },
    aliyunSearchForced: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchForced,
    },
    aliyunSearchStrategy: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchStrategy,
    },
    aliyunSearchEnableSource: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchEnableSource,
    },
    aliyunSearchEnableCitation: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchEnableCitation,
    },
    aliyunSearchCitationFormat: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchCitationFormat,
    },
    aliyunSearchEnableSearchExtension: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchEnableSearchExtension,
    },
    aliyunSearchPrependSearchResult: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchPrependSearchResult,
    },
    aliyunSearchFreshness: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchFreshness,
    },
    aliyunSearchAssignedSiteList: {
      type: [String],
      default: () => [...DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchAssignedSiteList],
    },
    aliyunSearchPromptIntervene: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchPromptIntervene,
    },
    aliyunResponsesEnableWebExtractor: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunResponsesEnableWebExtractor,
    },
    aliyunResponsesEnableCodeInterpreter: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunResponsesEnableCodeInterpreter,
    },
    aliyunFileProcessMode: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.aliyunFileProcessMode,
    },
    openrouterPreset: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterPreset,
    },
    openrouterIncludeReasoning: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterIncludeReasoning,
    },
    openrouterUseWebPlugin: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterUseWebPlugin,
    },
    openrouterWebPluginEngine: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterWebPluginEngine,
    },
    openrouterWebPluginMaxResults: {
      type: Number,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterWebPluginMaxResults,
    },
    openrouterUseResponseHealing: {
      type: Boolean,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterUseResponseHealing,
    },
    openrouterPdfEngine: {
      type: String,
      default: DEFAULT_AGENT_RUNTIME_CONFIG.openrouterPdfEngine,
    },
  },
  { _id: false },
);

const adminConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: ADMIN_CONFIG_KEY,
      index: true,
    },
    agentSystemPrompts: {
      type: new mongoose.Schema(
        {
          A: { type: String, default: "" },
          B: { type: String, default: "" },
          C: { type: String, default: "" },
          D: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: () => ({
        A: "",
        B: "",
        C: "",
        D: "",
      }),
    },
    agentRuntimeConfigs: {
      type: new mongoose.Schema(
        {
          A: { type: runtimeConfigSchema, default: () => ({}) },
          B: { type: runtimeConfigSchema, default: () => ({}) },
          C: { type: runtimeConfigSchema, default: () => ({}) },
          D: { type: runtimeConfigSchema, default: () => ({}) },
        },
        { _id: false },
      ),
      default: () => createDefaultAgentRuntimeConfigMap(),
    },
  },
  {
    timestamps: true,
    collection: "admin_configs",
  },
);

const AdminConfig =
  mongoose.models.AdminConfig || mongoose.model("AdminConfig", adminConfigSchema);
const AgentEConfig = createAgentEConfigModel(mongoose);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/status", async (_req, res) => {
  const [totalUsers, admin] = await Promise.all([
    AuthUser.countDocuments({}),
    AuthUser.findOne({ role: "admin" }).sort({ createdAt: 1 }).lean(),
  ]);

  res.json({
    ok: true,
    hasAnyUser: totalUsers > 0,
    hasAdmin: !!admin,
    adminUsername: admin?.username || "admin",
  });
});

app.get("/api/chat/bootstrap", requireChatAuth, async (req, res) => {
  const user = req.authUser;
  const [stateDoc, adminConfig] = await Promise.all([
    ChatState.findOne({ userId: user._id }).lean(),
    readAdminAgentConfig(),
  ]);

  const normalizedProfile = sanitizeUserProfile(user.profile);
  const profileComplete = isUserProfileComplete(normalizedProfile);
  const state = normalizeChatStateDoc(stateDoc);

  res.json({
    ok: true,
    user: toPublicUser(user),
    profile: normalizedProfile,
    profileComplete,
    state,
    agentRuntimeConfigs: resolveAgentRuntimeConfigs(adminConfig.runtimeConfigs),
    agentProviderDefaults: buildAgentProviderDefaults(),
  });
});

app.get("/api/user/profile", requireChatAuth, async (req, res) => {
  const profile = sanitizeUserProfile(req.authUser.profile);
  res.json({
    ok: true,
    profile,
    profileComplete: isUserProfileComplete(profile),
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
  const nextState = sanitizeChatStatePayload(req.body || {});

  await ChatState.findOneAndUpdate(
    { userId: req.authUser._id },
    {
      $set: {
        userId: req.authUser._id,
        activeId: nextState.activeId,
        groups: nextState.groups,
        sessions: nextState.sessions,
        sessionMessages: nextState.sessionMessages,
        settings: nextState.settings,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ ok: true });
});

app.put("/api/chat/state/meta", requireChatAuth, async (req, res) => {
  const nextMeta = sanitizeChatStateMetaPayload(req.body || {});

  await ChatState.findOneAndUpdate(
    { userId: req.authUser._id },
    {
      $set: {
        userId: req.authUser._id,
        activeId: nextMeta.activeId,
        groups: nextMeta.groups,
        sessions: nextMeta.sessions,
        settings: nextMeta.settings,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
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
    sessionId,
  });

  res.json({ ok: true });
});

app.put("/api/chat/state/messages", requireChatAuth, async (req, res) => {
  const upserts = sanitizeSessionMessageUpsertsPayload(req.body || {});
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
    { sessionMessages: 1 },
  ).lean();
  const sourceMessages =
    stateDoc?.sessionMessages && typeof stateDoc.sessionMessages === "object"
      ? stateDoc.sessionMessages
      : {};

  const setPayload = { userId: req.authUser._id };
  bySession.forEach((updates, sessionId) => {
    const currentList = Array.isArray(sourceMessages[sessionId])
      ? sourceMessages[sessionId].slice(0, 400)
      : [];

    const indexById = new Map();
    currentList.forEach((message, idx) => {
      if (!message?.id) return;
      indexById.set(message.id, idx);
    });

    updates.forEach((message) => {
      const existingIndex = indexById.get(message.id);
      if (Number.isInteger(existingIndex)) {
        currentList[existingIndex] = message;
        return;
      }
      if (currentList.length < 400) {
        currentList.push(message);
        indexById.set(message.id, currentList.length - 1);
      }
    });

    setPayload[`sessionMessages.${sessionId}`] = currentList;
  });

  await ChatState.findOneAndUpdate(
    { userId: req.authUser._id },
    { $set: setPayload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ ok: true, updated: upserts.length });
});

app.post("/api/auth/register", async (req, res) => {
  const password = String(req.body?.password || "");
  const usernameInput = String(req.body?.username || "");
  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const totalUsers = await AuthUser.countDocuments({});
  const bootstrapMode = totalUsers === 0;
  const username = bootstrapMode ? "admin" : normalizeUsername(usernameInput);

  if (!username) {
    res.status(400).json({ error: "请输入用户名。" });
    return;
  }

  if (!bootstrapMode && toUsernameKey(username) === "admin") {
    res.status(400).json({ error: "admin 为保留账号名，请使用其他用户名。" });
    return;
  }

  const usernameKey = toUsernameKey(username);
  const existing = await AuthUser.findOne({ usernameKey }).lean();
  if (existing) {
    res.status(409).json({ error: "该账号已存在，请更换用户名。" });
    return;
  }

  const role = bootstrapMode ? "admin" : "user";
  const passwordHash = await hashPassword(password);
  const user = await AuthUser.create({
    username,
    usernameKey,
    role,
    passwordHash,
    passwordPlain: password,
  });

  res.status(201).json({
    ok: true,
    bootstrapAdmin: bootstrapMode,
    user: toPublicUser(user),
  });
});

app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || "");
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

  const token = signToken(
    { uid: String(user._id), role: user.role, scope: "chat" },
    AUTH_TOKEN_TTL_SECONDS,
  );

  res.json({
    ok: true,
    token,
    user: toPublicUser(user),
  });
});

app.post("/api/auth/forgot/verify", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!username) {
    res.status(400).json({ error: "请输入账号。" });
    return;
  }

  const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) }).lean();
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

  user.passwordHash = await hashPassword(newPassword);
  user.passwordPlain = newPassword;
  await user.save();

  res.json({ ok: true, message: "密码已重置。" });
});

app.post("/api/auth/admin/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username || "admin");
  const password = String(req.body?.password || "");

  if (!password) {
    res.status(400).json({ error: "请输入管理员密码。" });
    return;
  }

  const user = await AuthUser.findOne({ usernameKey: toUsernameKey(username) });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  const isAdmin = !!user && user.role === "admin" && user.usernameKey === "admin";

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

  const doc = await AdminConfig.findOneAndUpdate(
    { key: ADMIN_CONFIG_KEY },
    {
      $set: {
        key: ADMIN_CONFIG_KEY,
        agentSystemPrompts: prompts,
        agentRuntimeConfigs: runtimeConfigs,
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

app.get("/api/auth/admin/users", async (req, res) => {
  if (!(await authenticateAdminRequest(req, res))) return;

  const users = await AuthUser.find({})
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

app.get("/api/auth/admin/export/users-txt", async (req, res) => {
  if (!(await authenticateAdminRequest(req, res))) return;

  const users = await AuthUser.find({})
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

  const users = await AuthUser.find({})
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const userIds = users.map((u) => u._id);
  const stateDocs = await ChatState.find({ userId: { $in: userIds } }).lean();
  const stateByUserId = new Map(
    stateDocs.map((doc) => [String(doc.userId), normalizeChatStateDoc(doc)]),
  );

  const content = buildAdminChatsExportTxt(users, stateByUserId);
  const suffix = formatFileStamp(new Date());
  res.json({
    ok: true,
    filename: `educhat-chats-${suffix}.txt`,
    content,
  });
});

app.get("/api/auth/admin/export/chats-zip", async (req, res) => {
  if (!(await authenticateAdminRequest(req, res))) return;

  const users = await AuthUser.find({})
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const userIds = users.map((u) => u._id);
  const stateDocs = await ChatState.find({ userId: { $in: userIds } }).lean();
  const stateByUserId = new Map(
    stateDocs.map((doc) => [String(doc.userId), normalizeChatStateDoc(doc)]),
  );

  const exportedAt = new Date();
  const userFiles = users.map((user, idx) => {
    const userId = String(user?._id || "");
    const state = stateByUserId.get(userId);
    const content = buildSingleUserChatExportTxt(user, state, idx + 1, exportedAt);
    const username = sanitizeZipFileNamePart(user?.username || `user-${idx + 1}`);
    const shortId = sanitizeZipFileNamePart(userId.slice(-8) || String(idx + 1));
    const fileName = `${String(idx + 1).padStart(3, "0")}-${username}-${shortId}.txt`;
    return { name: fileName, content };
  });

  const readmeContent = buildZipReadme(userFiles.length, exportedAt);
  const zipBuffer = buildZipBuffer([
    { name: "README.txt", content: readmeContent },
    ...userFiles,
  ]);

  const suffix = formatFileStamp(exportedAt);
  const fileName = `educhat-chats-by-user-${suffix}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", buildAttachmentContentDisposition(fileName));
  res.send(zipBuffer);
});

app.delete("/api/auth/admin/chats", async (req, res) => {
  if (!(await authenticateAdminRequest(req, res))) return;

  const imageHistoryDocs = await GeneratedImageHistory.find(
    {},
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
  const [chatStateResult, uploadedContextResult, imageHistoryResult] = await Promise.all([
    ChatState.deleteMany({}),
    UploadedFileContext.deleteMany({}),
    GeneratedImageHistory.deleteMany({}),
  ]);
  res.json({
    ok: true,
    deletedCount: Number(chatStateResult?.deletedCount || 0),
    deletedUploadedFileContextCount: Number(uploadedContextResult?.deletedCount || 0),
    deletedImageHistoryCount: Number(imageHistoryResult?.deletedCount || 0),
    deletedImageHistoryOssObjectCount: Number(deleteImageHistoryOssSummary?.deletedCount || 0),
    failedImageHistoryOssKeys: Array.isArray(deleteImageHistoryOssSummary?.failedKeys)
      ? deleteImageHistoryOssSummary.failedKeys
      : [],
  });
});

app.post(
  "/api/auth/admin/agent-debug-stream",
  requireAdminAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const sessionId = sanitizeId(req.body?.sessionId, `admin-debug-${agentId}`);
    const adminUserId = sanitizeId(req.authAdmin?._id, "admin");
    const messages = readRequestMessages(req.body?.messages);
    const runtimeConfig = sanitizeSingleAgentRuntimeConfig(
      readJsonLikeField(req.body?.runtimeConfig, {}),
      agentId,
    );
    const files = Array.isArray(req.files) ? req.files : [];
    const volcengineFileRefs = readRequestVolcengineFileRefs(
      req.body?.volcengineFileRefs,
    );
    const preparedAttachmentRefs = readRequestPreparedAttachmentRefs(
      req.body?.preparedAttachmentRefs,
    );

    await streamAgentResponse({
      res,
      agentId,
      messages,
      files,
      volcengineFileRefs,
      preparedAttachmentRefs,
      runtimeConfig,
      chatUserId: adminUserId,
      sessionId,
      attachUploadedFiles: files.length > 0 || preparedAttachmentRefs.length > 0,
    });
  },
);

app.post(
  "/api/auth/admin/agent-e/debug-stream",
  requireAdminAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const sessionId = sanitizeId(req.body?.sessionId, "admin-debug-E");
    const adminUserId = sanitizeId(req.authAdmin?._id, "admin");
    const messages = readRequestMessages(req.body?.messages);
    const files = Array.isArray(req.files) ? req.files : [];
    const runtimeOverride = readJsonLikeField(req.body?.runtimeOverride, null);
    const volcengineFileRefs = readRequestVolcengineFileRefs(
      req.body?.volcengineFileRefs,
    );
    const preparedAttachmentRefs = readRequestPreparedAttachmentRefs(
      req.body?.preparedAttachmentRefs,
    );
    await streamAgentEResponse({
      res,
      messages,
      files,
      volcengineFileRefs,
      preparedAttachmentRefs,
      runtimeOverride,
      chatUserId: adminUserId,
      sessionId,
      attachUploadedFiles: files.length > 0 || preparedAttachmentRefs.length > 0,
    });
  },
);

app.post(
  "/api/auth/admin/volcengine-files/upload",
  requireAdminAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const files = Array.isArray(req.files) ? req.files.filter(Boolean) : [];
    if (files.length === 0) {
      res.json({ ok: true, files: [] });
      return;
    }

    const runtimeConfig = await getResolvedAgentRuntimeConfig(agentId);
    const provider = getProviderByAgent(agentId, runtimeConfig);
    const protocol = resolveRequestProtocol(runtimeConfig.protocol, provider).value;
    if (provider !== "volcengine" || protocol !== "responses") {
      res.status(400).json({ error: "当前智能体不是火山引擎 Responses 协议，不能使用 Files API 上传。" });
      return;
    }

    const providerConfig = getProviderConfig("volcengine");
    if (!providerConfig.apiKey) {
      res.status(500).json({ error: providerConfig.missingKeyMessage });
      return;
    }
    if (!providerConfig.filesEndpoint) {
      res.status(500).json({ error: "未配置火山引擎 Files API 端点。" });
      return;
    }

    try {
      const model = getModelByAgent(agentId, runtimeConfig);
      const uploadedBundle = await uploadVolcengineMultipartFilesAsRefs({
        files,
        model,
        filesEndpoint: providerConfig.filesEndpoint,
        apiKey: providerConfig.apiKey,
        strictSupportedTypes: true,
      });
      const uploadedToOss = await uploadChatAttachmentsToOss({
        files: uploadedBundle.uploadedFiles,
        userId: "admin",
        sessionId: "",
        source: "admin-volcengine-files-api",
        stopOnError: false,
      });
      const refsWithOss = uploadedBundle.uploadedRefs.map((item, idx) => {
        const oss = uploadedToOss[idx] || null;
        return {
          ...item,
          url: sanitizeGroupChatHttpUrl(oss?.fileUrl),
          ossKey: sanitizeGroupChatOssObjectKey(oss?.ossKey),
        };
      });

      res.json({
        ok: true,
        files: refsWithOss,
      });
    } catch (error) {
      const message = error?.message || "火山文件上传失败，请稍后重试。";
      const status = String(message).includes("文件类型不支持 Files API 上传")
        ? 400
        : 500;
      res.status(status).json({
        error: message,
      });
    }
  },
);

app.post(
  "/api/auth/admin/attachments/prepare",
  requireAdminAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const sessionId = sanitizeId(req.body?.sessionId, `admin-debug-${agentId}`);
    const userId = sanitizeId(req.authAdmin?._id, "admin");
    const files = Array.isArray(req.files) ? req.files.filter(Boolean) : [];
    if (files.length === 0) {
      res.json({ ok: true, files: [] });
      return;
    }

    const runtimeConfig = await getResolvedAgentRuntimeConfig(agentId);
    const provider = getProviderByAgent(agentId, runtimeConfig);
    const model = getModelByAgent(agentId, runtimeConfig);
    const protocol = resolveRequestProtocol(runtimeConfig.protocol, provider, model).value;
    const aliyunFileProcessMode = sanitizeAliyunFileProcessMode(
      runtimeConfig?.aliyunFileProcessMode,
    );
    if (provider !== "aliyun") {
      res.status(400).json({ error: "当前智能体不需要 PDF 预处理。" });
      return;
    }

    try {
      const preparedFiles = [];
      for (let idx = 0; idx < files.length; idx += 1) {
        const file = files[idx];
        const ext = getFileExtension(file?.originalname);
        const mime = sanitizeGroupChatFileMimeType(file?.mimetype);
        if (!isPdfFile(ext, mime)) {
          throw new Error("仅支持 PDF 预处理，请重新选择文件。");
        }
        if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) {
          throw new Error("PDF 文件内容为空，无法预处理。");
        }

        const converted = await buildAliyunDashScopePdfImageParts(file, {
          userId,
          sessionId,
          ossScope: CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE,
        });
        let parts = Array.isArray(converted?.parts) ? converted.parts : [];
        let fallbackApplied = false;
        if (parts.length === 0) {
          const fallback = await buildParsedFilePreviewTextPart(file, {
            maxChars: ALIYUN_DASHSCOPE_PARSED_DOC_MAX_CHARS,
          });
          if (fallback) {
            parts = [fallback];
            fallbackApplied = true;
          }
        }
        if (parts.length === 0) {
          throw new Error(converted?.error || "PDF 转图片失败，请稍后重试。");
        }

        const fileName = sanitizeGroupChatFileName(file?.originalname);
        const fileSize = sanitizeRuntimeInteger(
          file?.size,
          file?.buffer?.length,
          0,
          GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
        );
        const token = savePreparedAttachmentToCache({
          userId,
          sessionId,
          provider,
          protocol,
          agentId,
          fileName,
          mimeType: mime,
          size: fileSize,
          parts,
          extra: {
            pageCount: Math.max(0, Number(converted?.pageCount) || 0),
            imageCount: parts.filter((item) => String(item?.type || "") === "image_url").length,
            fallbackApplied,
            aliyunFileProcessMode,
            ossFiles: normalizeUploadedFileContextOssFiles(converted?.ossFiles),
          },
        });
        if (!token) {
          throw new Error("PDF 预处理缓存失败，请稍后重试。");
        }
        const imageCount = parts.filter((item) => String(item?.type || "") === "image_url").length;
        preparedFiles.push({
          token,
          fileName,
          mimeType: mime,
          size: fileSize,
          pageCount: Math.max(0, Number(converted?.pageCount) || 0),
          imageCount,
          fallbackApplied,
          expiresInMs: CHAT_PREPARED_ATTACHMENT_CACHE_TTL_MS,
        });
      }

      res.json({
        ok: true,
        files: preparedFiles,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "PDF 预处理失败，请稍后重试。",
      });
    }
  },
);

app.post(
  "/api/chat/volcengine-files/upload",
  requireChatAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const userId = sanitizeId(req.authUser?._id, "");
    const files = Array.isArray(req.files) ? req.files.filter(Boolean) : [];
    if (files.length === 0) {
      res.json({ ok: true, files: [] });
      return;
    }

    const runtimeConfig = await getResolvedAgentRuntimeConfig(agentId);
    const provider = getProviderByAgent(agentId, runtimeConfig);
    const protocol = resolveRequestProtocol(runtimeConfig.protocol, provider).value;
    if (provider !== "volcengine" || protocol !== "responses") {
      res.status(400).json({ error: "当前智能体不是火山引擎 Responses 协议，不能使用 Files API 上传。" });
      return;
    }

    const providerConfig = getProviderConfig("volcengine");
    if (!providerConfig.apiKey) {
      res.status(500).json({ error: providerConfig.missingKeyMessage });
      return;
    }
    if (!providerConfig.filesEndpoint) {
      res.status(500).json({ error: "未配置火山引擎 Files API 端点。" });
      return;
    }

    try {
      const model = getModelByAgent(agentId, runtimeConfig);
      const uploadedBundle = await uploadVolcengineMultipartFilesAsRefs({
        files,
        model,
        filesEndpoint: providerConfig.filesEndpoint,
        apiKey: providerConfig.apiKey,
        strictSupportedTypes: true,
      });
      const uploadedToOss = await uploadChatAttachmentsToOss({
        files: uploadedBundle.uploadedFiles,
        userId,
        sessionId: "",
        source: "chat-volcengine-files-api",
        stopOnError: false,
      });
      const refsWithOss = uploadedBundle.uploadedRefs.map((item, idx) => {
        const oss = uploadedToOss[idx] || null;
        return {
          ...item,
          url: sanitizeGroupChatHttpUrl(oss?.fileUrl),
          ossKey: sanitizeGroupChatOssObjectKey(oss?.ossKey),
        };
      });

      res.json({
        ok: true,
        files: refsWithOss,
      });
    } catch (error) {
      const message = error?.message || "火山文件上传失败，请稍后重试。";
      const status = String(message).includes("文件类型不支持 Files API 上传")
        ? 400
        : 500;
      res.status(status).json({
        error: message,
      });
    }
  },
);

app.post(
  "/api/chat/attachments/prepare",
  requireChatAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const sessionId = sanitizeId(req.body?.sessionId, "");
    const userId = sanitizeId(req.authUser?._id, "");
    if (!userId) {
      res.status(400).json({ error: "无效用户身份。" });
      return;
    }

    const files = Array.isArray(req.files) ? req.files.filter(Boolean) : [];
    if (files.length === 0) {
      res.json({ ok: true, files: [] });
      return;
    }

    const runtimeConfig = await getResolvedAgentRuntimeConfig(agentId);
    const provider = getProviderByAgent(agentId, runtimeConfig);
    const model = getModelByAgent(agentId, runtimeConfig);
    const protocol = resolveRequestProtocol(runtimeConfig.protocol, provider, model).value;
    const aliyunFileProcessMode = sanitizeAliyunFileProcessMode(
      runtimeConfig?.aliyunFileProcessMode,
    );
    if (provider !== "aliyun") {
      res.status(400).json({ error: "当前智能体不需要 PDF 预处理。" });
      return;
    }

    try {
      const preparedFiles = [];
      for (let idx = 0; idx < files.length; idx += 1) {
        const file = files[idx];
        const ext = getFileExtension(file?.originalname);
        const mime = sanitizeGroupChatFileMimeType(file?.mimetype);
        if (!isPdfFile(ext, mime)) {
          throw new Error("仅支持 PDF 预处理，请重新选择文件。");
        }
        if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) {
          throw new Error("PDF 文件内容为空，无法预处理。");
        }

        const converted = await buildAliyunDashScopePdfImageParts(file, {
          userId,
          sessionId,
          ossScope: CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE,
        });
        let parts = Array.isArray(converted?.parts) ? converted.parts : [];
        let fallbackApplied = false;
        if (parts.length === 0) {
          const fallback = await buildParsedFilePreviewTextPart(file, {
            maxChars: ALIYUN_DASHSCOPE_PARSED_DOC_MAX_CHARS,
          });
          if (fallback) {
            parts = [fallback];
            fallbackApplied = true;
          }
        }
        if (parts.length === 0) {
          throw new Error(converted?.error || "PDF 转图片失败，请稍后重试。");
        }

        const fileName = sanitizeGroupChatFileName(file?.originalname);
        const fileSize = sanitizeRuntimeInteger(
          file?.size,
          file?.buffer?.length,
          0,
          GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
        );
        const token = savePreparedAttachmentToCache({
          userId,
          sessionId,
          provider,
          protocol,
          agentId,
          fileName,
          mimeType: mime,
          size: fileSize,
          parts,
          extra: {
            pageCount: Math.max(0, Number(converted?.pageCount) || 0),
            imageCount: parts.filter((item) => String(item?.type || "") === "image_url").length,
            fallbackApplied,
            aliyunFileProcessMode,
            ossFiles: normalizeUploadedFileContextOssFiles(converted?.ossFiles),
          },
        });
        if (!token) {
          throw new Error("PDF 预处理缓存失败，请稍后重试。");
        }
        const imageCount = parts.filter((item) => String(item?.type || "") === "image_url").length;
        preparedFiles.push({
          token,
          fileName,
          mimeType: mime,
          size: fileSize,
          pageCount: Math.max(0, Number(converted?.pageCount) || 0),
          imageCount,
          fallbackApplied,
          expiresInMs: CHAT_PREPARED_ATTACHMENT_CACHE_TTL_MS,
        });
      }

      res.json({
        ok: true,
        files: preparedFiles,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "PDF 预处理失败，请稍后重试。",
      });
    }
  },
);

app.post(
  "/api/chat/stream",
  requireChatAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const sessionId = sanitizeId(req.body?.sessionId, "");
    const smartContextEnabled = sanitizeRuntimeBoolean(req.body?.smartContextEnabled, false);
    const contextMode = sanitizeSmartContextMode(req.body?.contextMode);
    const volcengineFileRefs = readRequestVolcengineFileRefs(
      req.body?.volcengineFileRefs,
    );
    const preparedAttachmentRefs = readRequestPreparedAttachmentRefs(
      req.body?.preparedAttachmentRefs,
    );
    let messages = [];
    try {
      messages = JSON.parse(req.body.messages || "[]");
    } catch {
      res.status(400).json({ error: "Invalid messages JSON" });
      return;
    }

    await streamAgentResponse({
      res,
      agentId,
      messages,
      files: req.files || [],
      chatUserId: String(req.authUser?._id || ""),
      sessionId,
      smartContextEnabled,
      contextMode,
      attachUploadedFiles: true,
      volcengineFileRefs,
      preparedAttachmentRefs,
    });
  },
);

app.post(
  "/api/chat/stream-e",
  requireChatAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const sessionId = sanitizeId(req.body?.sessionId, "");
    const smartContextEnabled = sanitizeRuntimeBoolean(req.body?.smartContextEnabled, false);
    const contextMode = sanitizeSmartContextMode(req.body?.contextMode);
    const volcengineFileRefs = readRequestVolcengineFileRefs(
      req.body?.volcengineFileRefs,
    );
    const preparedAttachmentRefs = readRequestPreparedAttachmentRefs(
      req.body?.preparedAttachmentRefs,
    );
    let messages = [];
    try {
      messages = JSON.parse(req.body.messages || "[]");
    } catch {
      res.status(400).json({ error: "Invalid messages JSON" });
      return;
    }

    await streamAgentEResponse({
      res,
      messages,
      files: req.files || [],
      chatUserId: String(req.authUser?._id || ""),
      sessionId,
      smartContextEnabled,
      contextMode,
      attachUploadedFiles: true,
      volcengineFileRefs,
      preparedAttachmentRefs,
    });
  },
);

app.post(
  "/api/images/seedream/stream",
  requireChatAuth,
  imageGenerationUpload.array("images", MAX_IMAGE_GENERATION_INPUT_FILES),
  async (req, res) => {
    await streamSeedreamImageGeneration({
      res,
      body: req.body || {},
      files: req.files || [],
      chatUserId: String(req.authUser?._id || ""),
    });
  },
);

app.get("/api/images/history", requireChatAuth, async (req, res) => {
  const userId = sanitizeId(req.authUser?._id, "");
  if (!userId) {
    res.status(400).json({ error: "无效用户身份。" });
    return;
  }

  const limit = sanitizeRuntimeInteger(req.query?.limit, 80, 1, 200);
  let docs = [];
  try {
    docs = await GeneratedImageHistory.find(
      {
        userId,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      },
      {
        prompt: 1,
        imageUrl: 1,
        imageStorageType: 1,
        responseFormat: 1,
        size: 1,
        model: 1,
        createdAt: 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    res.status(500).json({
      error: error?.message || "读取图片历史失败，请稍后重试。",
    });
    return;
  }

  res.json({
    ok: true,
    items: Array.isArray(docs) ? docs.map(toGeneratedImageHistoryItem) : [],
  });
});

app.get("/api/images/history/:imageId/content", async (req, res) => {
  const userId = resolveImageHistoryAuthUserId(req);
  const imageId = sanitizeId(req.params?.imageId, "");
  if (!userId || !imageId) {
    res.status(401).json({ error: "登录状态无效或已过期，请重新登录。" });
    return;
  }

  try {
    const doc = await GeneratedImageHistory.findOne(
      {
        _id: imageId,
        userId,
      },
      {
        imageUrl: 1,
        ossKey: 1,
        imageData: 1,
        imageMimeType: 1,
        imageStorageType: 1,
        expiresAt: 1,
      },
    ).lean();
    if (!doc) {
      res.status(404).json({ error: "图片不存在或已过期。" });
      return;
    }

    const expiresAt = sanitizeIsoDate(doc?.expiresAt);
    const imageStorageType = normalizeGeneratedImageStorageType(doc?.imageStorageType);
    if (imageStorageType !== "oss" && expiresAt && Date.parse(expiresAt) <= Date.now()) {
      res.status(410).json({ error: "图片已过期。" });
      return;
    }

    const ossKey = sanitizeGroupChatOssObjectKey(doc?.ossKey);
    if (ossKey) {
      const ossUrl =
        sanitizeGroupChatHttpUrl(doc?.imageUrl) || buildGroupChatOssObjectUrl(ossKey);
      if (/^https?:\/\//i.test(ossUrl)) {
        res.redirect(ossUrl);
        return;
      }
    }

    const imageBuffer = extractGeneratedImageDataBuffer(doc?.imageData);
    const imageMimeType = normalizeGeneratedImageMimeType(doc?.imageMimeType);
    if (imageBuffer.length > 0) {
      res.setHeader("Content-Type", imageMimeType || "image/png");
      res.setHeader("Content-Length", String(imageBuffer.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.send(imageBuffer);
      return;
    }

    const fallbackUrl = normalizeGeneratedImageStoreUrl(doc?.imageUrl || "");
    if (/^https?:\/\//i.test(fallbackUrl)) {
      res.redirect(fallbackUrl);
      return;
    }
    const fallbackParsedDataUrl = parseGeneratedImageDataUrl(fallbackUrl);
    if (fallbackParsedDataUrl) {
      res.setHeader("Content-Type", fallbackParsedDataUrl.mimeType || "image/png");
      res.setHeader("Content-Length", String(fallbackParsedDataUrl.data.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.send(fallbackParsedDataUrl.data);
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

app.delete("/api/images/history", requireChatAuth, async (req, res) => {
  const userId = sanitizeId(req.authUser?._id, "");
  if (!userId) {
    res.status(400).json({ error: "无效用户身份。" });
    return;
  }

  try {
    const historyDocs = await GeneratedImageHistory.find(
      { userId },
      { _id: 1, ossKey: 1 },
    ).lean();
    const deleteOssSummary = await deleteGeneratedImageHistoryOssObjects(historyDocs);
    const result = await GeneratedImageHistory.deleteMany({ userId });
    res.json({
      ok: true,
      deletedCount: Number(result?.deletedCount || 0),
      deletedOssObjectCount: Number(deleteOssSummary?.deletedCount || 0),
      failedOssKeys: Array.isArray(deleteOssSummary?.failedKeys)
        ? deleteOssSummary.failedKeys
        : [],
    });
  } catch (error) {
    res.status(500).json({
      error: error?.message || "批量清空图片历史失败，请稍后重试。",
    });
  }
});

app.delete("/api/images/history/:imageId", requireChatAuth, async (req, res) => {
  const userId = sanitizeId(req.authUser?._id, "");
  const imageId = sanitizeId(req.params?.imageId, "");
  if (!userId || !imageId) {
    res.status(400).json({ error: "无效参数。" });
    return;
  }

  try {
    const deleted = await GeneratedImageHistory.findOneAndDelete({
      _id: imageId,
      userId,
    }, {
      projection: {
        _id: 1,
        ossKey: 1,
      },
    });
    const deleteOssSummary = await deleteGeneratedImageHistoryOssObjects(
      deleted ? [deleted] : [],
    );
    res.json({
      ok: true,
      deleted: !!deleted,
      deletedOssObjectCount: Number(deleteOssSummary?.deletedCount || 0),
      failedOssKeys: Array.isArray(deleteOssSummary?.failedKeys)
        ? deleteOssSummary.failedKeys
        : [],
    });
  } catch (error) {
    if (String(error?.name || "") === "CastError") {
      res.status(400).json({ error: "无效图片 ID。" });
      return;
    }
    res.status(500).json({
      error: error?.message || "删除图片历史失败，请稍后重试。",
    });
  }
});

app.get("/api/group-chat/bootstrap", requireChatAuth, async (req, res) => {
  const userId = sanitizeId(req.authUser?._id, "");
  if (!userId) {
    res.status(400).json({ error: "无效用户身份。" });
    return;
  }

  try {
    const rooms = await GroupChatRoom.find({ memberUserIds: userId })
      .sort({ updatedAt: -1 })
      .limit(GROUP_CHAT_MAX_ROOMS_PER_BOOTSTRAP)
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
        maxCreatedRoomsPerUser: GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER,
        maxJoinedRoomsPerUser: GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER,
        maxMembersPerRoom: GROUP_CHAT_MAX_MEMBERS_PER_ROOM,
      },
      counts: {
        createdRooms: roomItems.filter((room) => room.ownerUserId === userId).length,
        joinedRooms: roomItems.length,
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
    const [createdCount, joinedCount] = await Promise.all([
      GroupChatRoom.countDocuments({ ownerUserId: userId }),
      GroupChatRoom.countDocuments({ memberUserIds: userId }),
    ]);

    if (createdCount >= GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER) {
      res.status(400).json({
        error: `每个用户最多创建 ${GROUP_CHAT_MAX_CREATED_ROOMS_PER_USER} 个群聊。`,
      });
      return;
    }
    if (joinedCount >= GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER) {
      res.status(400).json({
        error: `每个用户最多加入 ${GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER} 个群聊。`,
      });
      return;
    }

    const roomCode = await generateUniqueGroupChatRoomCode();
    const roomDoc = await GroupChatRoom.create({
      roomCode,
      name: roomName,
      ownerUserId: userId,
      memberUserIds: [userId],
      memberCount: 1,
    });

    const systemMessageDoc = await createGroupChatSystemMessage({
      roomId: sanitizeId(roomDoc?._id, ""),
      content: `${buildGroupChatDisplayName(req.authUser)} 创建了派`,
    });
    if (systemMessageDoc?._id) {
      await markGroupChatRoomReadByMessageId({
        roomId: sanitizeId(roomDoc?._id, ""),
        userId,
        messageId: sanitizeId(systemMessageDoc?._id, ""),
      });
    }
    broadcastGroupChatMessageCreated(sanitizeId(roomDoc?._id, ""), systemMessageDoc);

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
  const roomCode = sanitizeGroupChatCode(req.body?.roomCode || req.body?.code);
  if (!userId) {
    res.status(400).json({ error: "无效用户身份。" });
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

    const joinedCount = await GroupChatRoom.countDocuments({ memberUserIds: userId });
    if (joinedCount >= GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER) {
      res.status(400).json({
        error: `每个用户最多加入 ${GROUP_CHAT_MAX_JOINED_ROOMS_PER_USER} 个群聊。`,
      });
      return;
    }

    const updated = await GroupChatRoom.findOneAndUpdate(
      {
        _id: normalizedRoom.id,
        memberUserIds: { $ne: userId },
        "memberUserIds.4": { $exists: false },
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
    if (!room) {
      res.status(403).json({ error: "你不在该群聊中，无法发送消息。" });
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
      if (!room) {
        res.status(403).json({ error: "你不在该群聊中，无法发送消息。" });
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
      if (!room) {
        res.status(403).json({ error: "你不在该群聊中，无法发送文件。" });
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

const distDir = path.resolve(process.cwd(), "dist");
const distIndexHtml = path.join(distDir, "index.html");
if (existsSync(distIndexHtml)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(distIndexHtml);
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "文件过大，请压缩后重试。" });
      return;
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      res.status(413).json({ error: "文件数量超过限制，请减少上传数量后重试。" });
      return;
    }
    res.status(400).json({ error: `上传失败: ${error.code}` });
    return;
  }

  res.status(500).json({ error: error?.message || "unknown server error" });
});

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant" || m.role === "system"),
    )
    .map((m) => ({
      id: sanitizeId(m.id, ""),
      role: m.role,
      content: normalizeMessageContent(m.content),
    }))
    .filter(
      (m) => hasUsableMessageContent(m.content) || (m.role === "user" && !!m.id),
    );
}

function normalizeMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts = [];
  content.slice(0, 80).forEach((part) => {
    if (!part || typeof part !== "object") return;
    const type = String(part.type || "")
      .trim()
      .toLowerCase();

    if (type === "text" || type === "input_text" || type === "output_text") {
      const text = typeof part.text === "string" ? part.text : "";
      if (text.trim()) {
        parts.push({ type: "text", text });
      }
      return;
    }

    if (type === "image_url" || type === "input_image") {
      const fileId = String(part.file_id || part.fileId || "").trim();
      if (fileId) {
        parts.push({ type: "input_image", file_id: fileId });
        return;
      }
      const imageUrl = extractInputImageUrl(part);
      if (!imageUrl) return;
      parts.push({ type: "image_url", image_url: { url: imageUrl } });
      return;
    }

    if (type === "input_file" || type === "input_video") {
      const fileId = String(part.file_id || part.fileId || "").trim();
      if (!fileId) return;
      parts.push({ type, file_id: fileId });
      return;
    }

    if (type === "file_url" || type === "input_file_url") {
      const fileUrl = extractAliyunFileUrl(part);
      if (!fileUrl) return;
      const payload = { url: fileUrl };
      const safeMime = sanitizeGroupChatFileMimeType(
        part?.file_url?.mime_type ||
          part?.file_url?.mimeType ||
          part?.mime_type ||
          part?.mimeType ||
          part?.mimetype ||
          "",
      );
      if (safeMime && safeMime !== "application/octet-stream") {
        payload.mime_type = safeMime;
      }
      const safeName = sanitizeText(
        part?.file_url?.name ||
          part?.file_url?.filename ||
          part?.name ||
          part?.filename ||
          "",
        "",
        180,
      );
      if (safeName) {
        payload.name = safeName;
      }
      parts.push({ type: "file_url", file_url: payload });
      return;
    }

    if (type === "file") {
      const filePayload = normalizeOpenRouterFilePart(part);
      if (filePayload) {
        parts.push({ type: "file", file: filePayload });
      }
      return;
    }

    if (type === "input_audio") {
      const audioPayload = normalizeOpenRouterAudioPart(part);
      if (audioPayload) {
        parts.push({ type: "input_audio", input_audio: audioPayload });
      }
      return;
    }

    if (type === "video_url") {
      const videoUrl = extractInputVideoUrl(part);
      if (videoUrl) {
        parts.push({ type: "video_url", video_url: { url: videoUrl } });
      }
    }
  });

  return parts;
}

function hasUsableMessageContent(content) {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }
  return Array.isArray(content) && content.length > 0;
}

function hasImageInputInMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.some((item) => messageContainsImageInput(item?.content));
}

function messageContainsImageInput(content) {
  const parts = Array.isArray(content)
    ? content
    : content && typeof content === "object"
      ? [content]
      : [];

  return parts.some((part) => {
    if (!part || typeof part !== "object") return false;
    if (typeof part.image === "string" && part.image.trim()) return true;
    const type = String(part.type || "")
      .trim()
      .toLowerCase();
    if (type === "image_url" || type === "input_image") return true;
    const imageUrl = extractInputImageUrl(part);
    return !!imageUrl;
  });
}

function isImageUploadFile(file) {
  const mime = String(file?.mimetype || file?.type || "")
    .trim()
    .toLowerCase();
  return mime.startsWith("image/");
}

function cloneNormalizedMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    const type = String(part?.type || "")
      .trim()
      .toLowerCase();
    if (type === "text") {
      return { type: "text", text: String(part?.text || "") };
    }
    if (type === "input_file" || type === "input_video" || type === "input_image") {
      const fileId = String(part?.file_id || part?.fileId || "").trim();
      if (fileId) {
        return { type, file_id: fileId };
      }
    }

    if (type === "file_url" || type === "input_file_url") {
      const fileUrl = extractAliyunFileUrl(part);
      if (fileUrl) {
        const payload = { url: fileUrl };
        const safeMime = sanitizeGroupChatFileMimeType(
          part?.file_url?.mime_type ||
            part?.file_url?.mimeType ||
            part?.mime_type ||
            part?.mimeType ||
            part?.mimetype ||
            "",
        );
        if (safeMime && safeMime !== "application/octet-stream") {
          payload.mime_type = safeMime;
        }
        const safeName = sanitizeText(
          part?.file_url?.name ||
            part?.file_url?.filename ||
            part?.name ||
            part?.filename ||
            "",
          "",
          180,
        );
        if (safeName) {
          payload.name = safeName;
        }
        return { type: "file_url", file_url: payload };
      }
    }
    const imageUrl = extractInputImageUrl(part);
    if (imageUrl) {
      return { type: "image_url", image_url: { url: imageUrl } };
    }

    if (type === "file") {
      const filePayload = normalizeOpenRouterFilePart(part);
      if (filePayload) {
        return { type: "file", file: filePayload };
      }
    }

    if (type === "input_audio") {
      const audioPayload = normalizeOpenRouterAudioPart(part);
      if (audioPayload) {
        return { type: "input_audio", input_audio: audioPayload };
      }
    }

    if (type === "video_url") {
      const videoUrl = extractInputVideoUrl(part);
      if (videoUrl) {
        return { type: "video_url", video_url: { url: videoUrl } };
      }
    }

    return null;
  }).filter(Boolean);
}

function resolveUploadedFileContextIdentity({ userId, sessionId, messageId }) {
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  const safeMessageId = sanitizeId(messageId, "");
  if (!safeUserId || !safeSessionId || !safeMessageId) return null;
  return {
    userId: safeUserId,
    sessionId: safeSessionId,
    messageId: safeMessageId,
  };
}

function buildUploadedFileContextExpireAt() {
  return new Date(Date.now() + UPLOADED_FILE_CONTEXT_CACHE_TTL_MS);
}

function sanitizeUploadedFileContextOssSource(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return "unknown";
  return text.slice(0, 60);
}

function normalizeUploadedFileContextOssFiles(value) {
  const safeList = Array.isArray(value) ? value : [];
  return safeList
    .slice(0, 40)
    .map((item) => ({
      fileName: sanitizeGroupChatFileName(item?.fileName),
      mimeType: sanitizeGroupChatFileMimeType(item?.mimeType),
      size: sanitizeRuntimeInteger(item?.size, 0, 0, GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES),
      source: sanitizeUploadedFileContextOssSource(item?.source),
      ossKey: sanitizeGroupChatOssObjectKey(item?.ossKey),
      ossBucket: sanitizeAliyunOssBucket(item?.ossBucket),
      ossRegion: sanitizeAliyunOssRegion(item?.ossRegion),
      fileUrl: sanitizeGroupChatHttpUrl(item?.fileUrl),
    }))
    .filter((item) => !!item.ossKey || !!item.fileUrl);
}

function resolveUploadedContextOssFileForInputFile(file, ossFiles = []) {
  const safeList = Array.isArray(ossFiles) ? ossFiles : [];
  if (safeList.length === 0) return null;

  const fallbackName = sanitizeGroupChatFileName(file?.originalname);
  const fallbackSize = Number(file?.size || 0);
  const fallbackMime = sanitizeGroupChatFileMimeType(file?.mimetype || "");

  return (
    safeList.find((item) => {
      const sameName =
        sanitizeGroupChatFileName(item?.fileName) === fallbackName && !!fallbackName;
      const sameSize =
        Number(item?.size || 0) === fallbackSize && Number.isFinite(fallbackSize);
      const sameMime =
        sanitizeGroupChatFileMimeType(item?.mimeType || "") === fallbackMime &&
        !!fallbackMime;
      return sameName || (sameSize && sameMime);
    }) || null
  );
}

function dedupeUploadedFileContextOssFiles(value) {
  const safeList = normalizeUploadedFileContextOssFiles(value);
  if (safeList.length <= 1) return safeList;

  const dedup = new Set();
  const normalized = [];
  safeList.forEach((item) => {
    const key = `${sanitizeGroupChatOssObjectKey(item?.ossKey)}::${sanitizeGroupChatHttpUrl(
      item?.fileUrl,
    )}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    normalized.push(item);
  });
  return normalized;
}

async function buildUploadedAttachmentLinksForClient(ossFiles = []) {
  const safeList = normalizeUploadedFileContextOssFiles(ossFiles);
  if (safeList.length === 0) return [];

  const links = [];
  for (let idx = 0; idx < safeList.length; idx += 1) {
    const item = safeList[idx];
    const fileName = sanitizeGroupChatFileName(item?.fileName);
    const directUrl = sanitizeGroupChatHttpUrl(item?.fileUrl);
    const previewUrl =
      groupChatOssConfig?.publicRead && directUrl
        ? directUrl
        : await resolveAliyunDashScopeAttachmentUrl({
            ossFile: item,
            fallbackFileName: fileName,
          });
    const safeUrl = sanitizeGroupChatHttpUrl(previewUrl || directUrl);
    if (!safeUrl) continue;
    links.push({
      fileName,
      mimeType: sanitizeGroupChatFileMimeType(item?.mimeType),
      size: sanitizeRuntimeInteger(
        item?.size,
        0,
        0,
        GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
      ),
      ossKey: sanitizeGroupChatOssObjectKey(item?.ossKey),
      url: safeUrl,
    });
  }
  return links;
}

async function saveUploadedFileContext({
  userId,
  sessionId,
  messageId,
  content,
  preparedAttachmentTokens = [],
  ossFiles = [],
}) {
  const identity = resolveUploadedFileContextIdentity({
    userId,
    sessionId,
    messageId,
  });
  if (!identity) return;
  const normalized = normalizeMessageContent(content);
  if (!hasUsableMessageContent(normalized)) return;
  const clonedContent = cloneNormalizedMessageContent(normalized);
  const safePreparedTokens = sanitizePreparedAttachmentTokens(preparedAttachmentTokens);
  const safeOssFiles = dedupeUploadedFileContextOssFiles(ossFiles);

  try {
    await UploadedFileContext.findOneAndUpdate(
      {
        userId: identity.userId,
        sessionId: identity.sessionId,
        messageId: identity.messageId,
      },
      {
        $set: {
          content: clonedContent,
          preparedAttachmentTokens: safePreparedTokens,
          ossFiles: safeOssFiles,
          expiresAt: buildUploadedFileContextExpireAt(),
        },
        $setOnInsert: {
          userId: identity.userId,
          sessionId: identity.sessionId,
          messageId: identity.messageId,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    console.warn(
      `Failed to persist uploaded file context (${identity.userId}/${identity.sessionId}/${identity.messageId}):`,
      error?.message || error,
    );
  }
}

async function pruneUploadedFileContextsForSession({
  userId,
  sessionId,
  keepMessageId,
}) {
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  const safeKeepMessageId = sanitizeId(keepMessageId, "");
  if (!safeUserId || !safeSessionId || !safeKeepMessageId) return;

  try {
    await UploadedFileContext.deleteMany({
      userId: safeUserId,
      sessionId: safeSessionId,
      messageId: { $ne: safeKeepMessageId },
    });
  } catch (error) {
    console.warn(
      `Failed to prune uploaded file contexts (${safeUserId}/${safeSessionId}, keep=${safeKeepMessageId}):`,
      error?.message || error,
    );
  }
}

function extractTextPartsForAliyunContext(content) {
  if (typeof content === "string") {
    const text = content.trim();
    return text ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => {
      const type = String(part?.type || "")
        .trim()
        .toLowerCase();
      if (type !== "text") return null;
      const text = String(part?.text || "");
      if (!text.trim()) return null;
      return { type: "text", text };
    })
    .filter(Boolean);
}

async function buildAliyunDashScopeMediaPartsFromOssFiles(
  ossFiles = [],
  { includeNativeDocuments = false } = {},
) {
  const safeOssFiles = normalizeUploadedFileContextOssFiles(ossFiles);
  if (safeOssFiles.length === 0) return [];

  const allowNativeDocuments = !!includeNativeDocuments;
  const parts = [];
  const dedup = new Set();
  for (const item of safeOssFiles) {
    const mime = sanitizeGroupChatFileMimeType(item?.mimeType).toLowerCase();
    const ext = getFileExtension(item?.fileName);
    const isImage = mime.startsWith("image/");
    const isVideo = mime.startsWith("video/");
    if (!isImage && !isVideo) {
      if (!allowNativeDocuments) continue;
      if (shouldForceAliyunDashScopeLocalParseForFile({ ext, mime, buffer: null })) continue;
    }

    const url = await resolveAliyunDashScopeAttachmentUrl({
      ossFile: item,
      fallbackFileName: item?.fileName,
    });
    if (!url) continue;

    const type = isImage ? "image_url" : isVideo ? "video_url" : "file_url";
    const key = `${type}::${url}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    if (isImage) {
      parts.push({ type: "image_url", image_url: { url } });
      continue;
    }
    if (isVideo) {
      parts.push({ type: "video_url", video_url: { url } });
      continue;
    }
    const docPart = buildAliyunDashScopeDocumentUrlPart({
      url,
      mime: item?.mimeType,
      fileName: item?.fileName,
    });
    if (docPart) {
      parts.push(docPart);
    }
  }
  return parts;
}

async function buildAliyunDashScopeRehydratedContent(
  content,
  ossFiles = [],
  { includeNativeDocuments = false } = {},
) {
  const normalized = normalizeMessageContent(content);
  const clonedBase = hasUsableMessageContent(normalized)
    ? cloneNormalizedMessageContent(normalized)
    : "";
  const mediaParts = await buildAliyunDashScopeMediaPartsFromOssFiles(ossFiles, {
    includeNativeDocuments,
  });
  if (mediaParts.length === 0) {
    return clonedBase;
  }
  const textParts = extractTextPartsForAliyunContext(normalized);
  const merged = [...textParts, ...mediaParts];
  if (merged.length > 0) return merged;
  return clonedBase;
}

async function rehydrateUploadedFileContexts(
  messages,
  {
    userId,
    sessionId,
    provider = "",
    protocol = "",
    agentId = "",
    model = "",
    aliyunFileProcessMode = "local_parse",
  } = {},
) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  if (!safeUserId || !safeSessionId) return;
  const safeProvider = normalizeProvider(provider);
  const safeProtocol = sanitizeRuntimeProtocol(protocol);
  const safeAgentId = sanitizeAgent(agentId);
  const safeAliyunFileProcessMode = sanitizeAliyunFileProcessMode(
    aliyunFileProcessMode,
  );
  const shouldKeepOnlyLatestAliyunFileContext =
    safeProvider === "aliyun" && resolveAliyunProtocol(safeProtocol) === "dashscope";
  const shouldRefreshAliyunMediaUrls =
    safeProvider === "aliyun" &&
    resolveAliyunProtocol(safeProtocol) === "dashscope" &&
    !!resolveAliyunModelPolicy(model)?.supported;
  const includeAliyunNativeDocuments =
    shouldRefreshAliyunMediaUrls && safeAliyunFileProcessMode === "native_oss_url";

  const targets = [];
  const messageIds = [];
  const seenMessageIds = new Set();

  messages.forEach((msg) => {
    if (!msg || msg.role !== "user") return;
    const messageId = sanitizeId(msg.id, "");
    if (!messageId) return;
    targets.push({ msg, messageId });
    if (seenMessageIds.has(messageId)) return;
    seenMessageIds.add(messageId);
    messageIds.push(messageId);
  });
  if (messageIds.length === 0) return;

  let docs = [];
  try {
    docs = await UploadedFileContext.find(
      {
        userId: safeUserId,
        sessionId: safeSessionId,
        messageId: { $in: messageIds },
        expiresAt: { $gt: new Date() },
      },
      { messageId: 1, content: 1, ossFiles: 1, preparedAttachmentTokens: 1 },
    ).lean();
  } catch (error) {
    console.warn(
      `Failed to read uploaded file context (${safeUserId}/${safeSessionId}):`,
      error?.message || error,
    );
    return;
  }
  if (!Array.isArray(docs) || docs.length === 0) return;

  const contentByMessageId = new Map();
  for (const doc of docs) {
    const messageId = sanitizeId(doc?.messageId, "");
    if (!messageId) continue;
    const normalized = normalizeMessageContent(doc?.content);
    if (!hasUsableMessageContent(normalized)) continue;

    let hydrated = cloneNormalizedMessageContent(normalized);
    if (shouldRefreshAliyunMediaUrls) {
      hydrated = await buildAliyunDashScopeRehydratedContent(
        normalized,
        doc?.ossFiles,
        { includeNativeDocuments: includeAliyunNativeDocuments },
      );
    }
    if (
      safeProvider === "aliyun" &&
      resolveAliyunProtocol(safeProtocol) === "dashscope" &&
      Array.isArray(doc?.preparedAttachmentTokens) &&
      doc.preparedAttachmentTokens.length > 0
    ) {
      const tokenRefs = doc.preparedAttachmentTokens.map((token) => ({ token }));
      const preparedResolution = resolvePreparedAttachmentRefsFromCache({
        refs: tokenRefs,
        userId: safeUserId,
        sessionId: safeSessionId,
        provider: safeProvider,
        protocol: safeProtocol,
        agentId: safeAgentId,
      });
      const preparedParts = Array.isArray(preparedResolution?.entries)
        ? preparedResolution.entries.flatMap((entry) =>
            cloneNormalizedMessageContent(normalizeMessageContent(entry?.parts)),
          )
        : [];
      if (preparedParts.length > 0) {
        const textParts = extractTextPartsForAliyunContext(hydrated);
        hydrated = [...textParts, ...preparedParts];
      }
    }
    if (!hasUsableMessageContent(hydrated)) continue;
    contentByMessageId.set(messageId, hydrated);
  }
  if (contentByMessageId.size === 0) return;

  let latestAliyunFileMessageId = "";
  if (shouldKeepOnlyLatestAliyunFileContext) {
    for (let i = targets.length - 1; i >= 0; i -= 1) {
      const candidateId = targets[i]?.messageId || "";
      if (candidateId && contentByMessageId.has(candidateId)) {
        latestAliyunFileMessageId = candidateId;
        break;
      }
    }
    if (!latestAliyunFileMessageId) return;
  }

  targets.forEach(({ msg, messageId }) => {
    if (
      shouldKeepOnlyLatestAliyunFileContext &&
      latestAliyunFileMessageId &&
      messageId !== latestAliyunFileMessageId
    ) {
      return;
    }
    const content = contentByMessageId.get(messageId);
    if (!content) return;
    msg.content = content;
  });
}

function sanitizeVolcengineFileRefsPayload(input) {
  const source = Array.isArray(input) ? input : [];
  return source
    .slice(0, MAX_FILES)
    .map((item) => {
      const fileId = sanitizeText(item?.fileId, "", 160);
      const inputType = String(item?.inputType || "")
        .trim()
        .toLowerCase();
      if (!fileId) return null;
      if (
        inputType !== "input_file" &&
        inputType !== "input_image" &&
        inputType !== "input_video"
      ) {
        return null;
      }
      return {
        fileId,
        inputType,
      };
    })
    .filter(Boolean);
}

function sanitizePreparedAttachmentRefsPayload(input) {
  const source = Array.isArray(input) ? input : [];
  const dedup = new Set();
  const list = [];
  source.slice(0, CHAT_PREPARED_ATTACHMENT_MAX_REFS).forEach((item) => {
    const token = sanitizePreparedAttachmentToken(item?.token || item?.preparedToken);
    if (!token || dedup.has(token)) return;
    dedup.add(token);
    list.push({
      token,
      fileName: sanitizeGroupChatFileName(item?.fileName || item?.name),
      mimeType: sanitizeGroupChatFileMimeType(item?.mimeType || item?.type),
      size: sanitizeRuntimeInteger(
        item?.size,
        0,
        0,
        GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
      ),
    });
  });
  return list;
}

function sanitizePreparedAttachmentTokens(input, maxCount = CHAT_PREPARED_ATTACHMENT_MAX_REFS) {
  const source = Array.isArray(input) ? input : [];
  const dedup = new Set();
  const tokens = [];
  source.slice(0, Math.max(0, Number(maxCount) || CHAT_PREPARED_ATTACHMENT_MAX_REFS)).forEach((item) => {
    const token = sanitizePreparedAttachmentToken(item);
    if (!token || dedup.has(token)) return;
    dedup.add(token);
    tokens.push(token);
  });
  return tokens;
}

function pruneExpiredChatPreparedAttachmentCache(now = Date.now()) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  if (chatPreparedAttachmentCache.size === 0) return;

  for (const [token, entry] of chatPreparedAttachmentCache.entries()) {
    const expireAtMs = Number(entry?.expireAtMs) || 0;
    if (expireAtMs > safeNow) continue;
    chatPreparedAttachmentCache.delete(token);
  }
}

function trimChatPreparedAttachmentCache(maxItems = CHAT_PREPARED_ATTACHMENT_CACHE_MAX_ITEMS) {
  const safeLimit = Math.max(40, Number(maxItems) || CHAT_PREPARED_ATTACHMENT_CACHE_MAX_ITEMS);
  if (chatPreparedAttachmentCache.size <= safeLimit) return;

  const sorted = Array.from(chatPreparedAttachmentCache.entries()).sort((a, b) => {
    const aCreated = Number(a?.[1]?.createdAtMs) || 0;
    const bCreated = Number(b?.[1]?.createdAtMs) || 0;
    return aCreated - bCreated;
  });
  const removeCount = Math.max(0, sorted.length - safeLimit);
  for (let idx = 0; idx < removeCount; idx += 1) {
    const token = sorted[idx]?.[0];
    if (!token) continue;
    chatPreparedAttachmentCache.delete(token);
  }
}

function createChatPreparedAttachmentToken() {
  return sanitizePreparedAttachmentToken(crypto.randomBytes(20).toString("hex"));
}

function savePreparedAttachmentToCache({
  userId = "",
  sessionId = "",
  provider = "",
  protocol = "",
  agentId = "",
  fileName = "",
  mimeType = "application/octet-stream",
  size = 0,
  parts = [],
  extra = {},
}) {
  const safeUserId = sanitizeId(userId, "");
  if (!safeUserId) return "";

  const normalizedParts = cloneNormalizedMessageContent(normalizeMessageContent(parts));
  if (!Array.isArray(normalizedParts) || normalizedParts.length === 0) return "";

  pruneExpiredChatPreparedAttachmentCache();
  trimChatPreparedAttachmentCache();

  let token = createChatPreparedAttachmentToken();
  for (let attempt = 0; attempt < 3 && (!token || chatPreparedAttachmentCache.has(token)); attempt += 1) {
    token = createChatPreparedAttachmentToken();
  }
  if (!token || chatPreparedAttachmentCache.has(token)) return "";

  const now = Date.now();
  const expireAtMs = now + CHAT_PREPARED_ATTACHMENT_CACHE_TTL_MS;
  const safeSessionId = sanitizeId(sessionId, "");
  const safeAgentId = sanitizeAgent(agentId);
  chatPreparedAttachmentCache.set(token, {
    token,
    userId: safeUserId,
    sessionId: safeSessionId,
    provider: normalizeProvider(provider),
    protocol: sanitizeRuntimeProtocol(protocol),
    agentId: safeAgentId,
    fileName: sanitizeGroupChatFileName(fileName),
    mimeType: sanitizeGroupChatFileMimeType(mimeType),
    size: sanitizeRuntimeInteger(size, 0, 0, GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES),
    parts: normalizedParts,
    extra: extra && typeof extra === "object" ? extra : {},
    createdAtMs: now,
    expireAtMs,
  });
  trimChatPreparedAttachmentCache();
  return token;
}

function resolvePreparedAttachmentRefsFromCache({
  refs = [],
  userId = "",
  sessionId = "",
  provider = "",
  protocol = "",
  agentId = "",
}) {
  const safeRefs = sanitizePreparedAttachmentRefsPayload(refs);
  if (safeRefs.length === 0) {
    return { entries: [], missing: [], mismatched: [] };
  }

  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  const safeProvider = normalizeProvider(provider);
  const safeProtocol = sanitizeRuntimeProtocol(protocol);
  const safeAgentId = sanitizeAgent(agentId);
  pruneExpiredChatPreparedAttachmentCache();

  const entries = [];
  const missing = [];
  const mismatched = [];
  safeRefs.forEach((ref) => {
    const token = sanitizePreparedAttachmentToken(ref?.token);
    if (!token) return;
    const cached = chatPreparedAttachmentCache.get(token);
    if (!cached) {
      missing.push(ref);
      return;
    }

    if (sanitizeId(cached.userId, "") !== safeUserId) {
      mismatched.push(ref);
      return;
    }
    const cachedSessionId = sanitizeId(cached.sessionId, "");
    if (safeSessionId && cachedSessionId && cachedSessionId !== safeSessionId) {
      mismatched.push(ref);
      return;
    }
    const cachedProvider = normalizeProvider(cached.provider || "");
    if (cachedProvider && safeProvider && cachedProvider !== safeProvider) {
      mismatched.push(ref);
      return;
    }
    const cachedProtocol = sanitizeRuntimeProtocol(cached.protocol || "");
    if (cachedProtocol && safeProtocol && cachedProtocol !== safeProtocol) {
      mismatched.push(ref);
      return;
    }
    const cachedAgentId = sanitizeAgent(cached.agentId || safeAgentId);
    if (safeAgentId && cachedAgentId && cachedAgentId !== safeAgentId) {
      mismatched.push(ref);
      return;
    }

    const normalizedParts = cloneNormalizedMessageContent(normalizeMessageContent(cached.parts));
    if (!Array.isArray(normalizedParts) || normalizedParts.length === 0) {
      missing.push(ref);
      return;
    }
    entries.push({
      token,
      fileName: sanitizeGroupChatFileName(cached.fileName || ref?.fileName),
      mimeType: sanitizeGroupChatFileMimeType(cached.mimeType || ref?.mimeType),
      size: sanitizeRuntimeInteger(
        cached.size,
        ref?.size,
        0,
        GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
      ),
      parts: normalizedParts,
      extra: cached.extra && typeof cached.extra === "object" ? cached.extra : {},
    });
  });

  return { entries, missing, mismatched };
}

function attachVolcengineFileRefsToLatestUserMessage(messages, fileRefs) {
  const safeRefs = sanitizeVolcengineFileRefsPayload(fileRefs);
  if (safeRefs.length === 0 || !Array.isArray(messages) || messages.length === 0) return null;

  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      idx = i;
      break;
    }
  }
  if (idx === -1) return null;

  const msg = messages[idx];
  const existing = normalizeMessageContent(msg.content);
  const parts = Array.isArray(existing)
    ? cloneNormalizedMessageContent(existing)
    : existing
      ? [{ type: "text", text: String(existing || "") }]
      : [];

  const existingRefKeys = new Set();
  parts.forEach((part) => {
    const type = String(part?.type || "")
      .trim()
      .toLowerCase();
    if (type !== "input_file" && type !== "input_image" && type !== "input_video") return;
    const fileId = String(part?.file_id || part?.fileId || "").trim();
    if (!fileId) return;
    existingRefKeys.add(`${type}::${fileId}`);
  });

  safeRefs.forEach((ref) => {
    const key = `${ref.inputType}::${ref.fileId}`;
    if (existingRefKeys.has(key)) return;
    existingRefKeys.add(key);
    parts.push({
      type: ref.inputType,
      file_id: ref.fileId,
    });
  });

  if (parts.length === 0) return null;
  msg.content = parts;
  return {
    messageId: sanitizeId(msg.id, ""),
    content: cloneNormalizedMessageContent(parts),
  };
}

function attachPreparedAttachmentPartsToLatestUserMessage(messages, preparedEntries = []) {
  const safeEntries = Array.isArray(preparedEntries) ? preparedEntries : [];
  if (safeEntries.length === 0) return null;
  const msg = resolveLatestUserMessage(messages);
  if (!msg) return null;

  const existing = normalizeMessageContent(msg.content);
  const parts = Array.isArray(existing)
    ? cloneNormalizedMessageContent(existing)
    : existing
      ? [{ type: "text", text: String(existing || "") }]
      : [];
  const usedTokens = [];

  safeEntries.forEach((entry) => {
    const token = sanitizePreparedAttachmentToken(entry?.token);
    const normalizedParts = cloneNormalizedMessageContent(
      normalizeMessageContent(entry?.parts),
    );
    if (!Array.isArray(normalizedParts) || normalizedParts.length === 0) return;
    parts.push(...normalizedParts);
    if (token) usedTokens.push(token);
  });

  if (parts.length === 0) return null;
  msg.content = parts;
  return {
    messageId: sanitizeId(msg.id, ""),
    content: cloneNormalizedMessageContent(parts),
    usedTokens,
  };
}

async function attachFilesToLatestUserMessage(
  messages,
  files,
  {
    provider = "openrouter",
    protocol = "chat",
    ossFiles = [],
    userId = "",
    sessionId = "",
    aliyunFileProcessMode = "local_parse",
  } = {},
) {
  if (!files || files.length === 0) return null;

  if (provider === "openrouter" && protocol === "chat") {
    return attachFilesToLatestUserMessageForOpenRouter(messages, files, {
      ossFiles,
    });
  }
  if (provider === "aliyun" && protocol === "dashscope") {
    return attachFilesToLatestUserMessageForAliyunDashScope(messages, files, {
      ossFiles,
      userId,
      sessionId,
      aliyunFileProcessMode,
    });
  }
  return attachFilesToLatestUserMessageByLocalParsing(messages, files, {
    ossFiles,
  });
}

function stripAliyunDocumentUrlPartsFromMessages(messages) {
  const safeList = Array.isArray(messages) ? messages : [];
  const stripped = safeList.map((msg) => {
    const normalized = normalizeMessageContent(msg?.content);
    if (typeof normalized === "string") {
      return {
        id: sanitizeId(msg?.id, ""),
        role: msg?.role,
        content: normalized,
      };
    }
    const filtered = (Array.isArray(normalized) ? normalized : []).filter((part) => {
      const type = String(part?.type || "")
        .trim()
        .toLowerCase();
      return type !== "file_url" && type !== "input_file_url";
    });
    return {
      id: sanitizeId(msg?.id, ""),
      role: msg?.role,
      content: filtered.length > 0 ? cloneNormalizedMessageContent(filtered) : "",
    };
  });
  return normalizeMessages(stripped);
}

function isAliyunDashScopeUnsupportedNativeFileErrorText(text) {
  const safe = String(text || "")
    .trim()
    .toLowerCase();
  if (!safe) return false;
  if (safe.includes("contentitem.init() got an unexpected keyword argument 'file_path'")) {
    return true;
  }
  if (safe.includes("contentitem.init()") && safe.includes("file_path")) {
    return true;
  }
  return false;
}

function resolveLatestUserMessage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i];
    }
  }
  return null;
}

function buildInitialAttachmentParts(content) {
  if (typeof content !== "string") return [];
  const text = content.trim();
  if (!text) return [];
  return [{ type: "text", text: content }];
}

function buildDataUrlForBuffer(buffer, mime) {
  if (!Buffer.isBuffer(buffer)) return "";
  const safeMime = String(mime || "application/octet-stream")
    .trim()
    .toLowerCase();
  return `data:${safeMime};base64,${buffer.toString("base64")}`;
}

function resolveOpenRouterAudioFormat({ mime, ext }) {
  const normalizedExt = String(ext || "")
    .trim()
    .toLowerCase();
  if (OPENROUTER_AUDIO_EXTENSIONS.has(normalizedExt)) {
    return normalizedExt;
  }

  const normalizedMime = String(mime || "")
    .trim()
    .toLowerCase();
  if (!normalizedMime) return "";
  const mapped = OPENROUTER_AUDIO_MIME_TO_FORMAT[normalizedMime];
  if (mapped) return mapped;
  if (!normalizedMime.startsWith("audio/")) return "";

  const subtype = normalizedMime.split("/")[1]?.split(";")[0] || "";
  if (!subtype) return "";
  if (OPENROUTER_AUDIO_FORMATS.has(subtype)) return subtype;
  if (subtype === "x-wav") return "wav";
  if (subtype === "mp4") return "m4a";
  return "";
}

function resolveOpenRouterVideoMime({ mime, ext }) {
  const normalizedMime = String(mime || "")
    .trim()
    .toLowerCase();
  if (normalizedMime.startsWith("video/")) {
    if (normalizedMime.includes("mp4")) return "video/mp4";
    if (normalizedMime.includes("mpeg")) return "video/mpeg";
    if (normalizedMime.includes("quicktime") || normalizedMime.includes("mov")) {
      return "video/mov";
    }
    if (normalizedMime.includes("webm")) return "video/webm";
  }

  const normalizedExt = String(ext || "")
    .trim()
    .toLowerCase();
  if (normalizedExt === "mp4") return "video/mp4";
  if (normalizedExt === "mpeg" || normalizedExt === "mpg") return "video/mpeg";
  if (normalizedExt === "mov") return "video/mov";
  if (normalizedExt === "webm") return "video/webm";
  return "";
}

async function buildOpenRouterFileInputPart(file, { ossFile = null } = {}) {
  const safeBuffer = Buffer.isBuffer(file?.buffer) ? file.buffer : Buffer.from([]);
  if (safeBuffer.length === 0) return null;

  const mime = String(file?.mimetype || "")
    .trim()
    .toLowerCase();
  const ext = getFileExtension(file?.originalname);
  const safeName = sanitizeText(file?.originalname, "upload.bin", 180);

  if (mime.startsWith("image/")) {
    const imageUrlFromOss = await resolveAliyunDashScopeAttachmentUrl({
      ossFile,
      fallbackFileName: safeName,
    });
    if (!imageUrlFromOss) return null;
    return { type: "image_url", image_url: { url: imageUrlFromOss } };
  }

  if (isPdfFile(ext, mime)) {
    const fileData = buildDataUrlForBuffer(safeBuffer, "application/pdf");
    if (!fileData) return null;
    return {
      type: "file",
      file: {
        filename: safeName || "document.pdf",
        file_data: fileData,
      },
    };
  }

  const audioFormat = resolveOpenRouterAudioFormat({ mime, ext });
  if (audioFormat) {
    return {
      type: "input_audio",
      input_audio: {
        data: safeBuffer.toString("base64"),
        format: audioFormat,
      },
    };
  }

  const videoMime = resolveOpenRouterVideoMime({ mime, ext });
  if (videoMime && OPENROUTER_VIDEO_EXTENSIONS.has(videoMime.replace("video/", ""))) {
    const videoUrlFromOss = await resolveAliyunDashScopeAttachmentUrl({
      ossFile,
      fallbackFileName: safeName,
    });
    const videoUrl = videoUrlFromOss || buildDataUrlForBuffer(safeBuffer, videoMime);
    if (!videoUrl) return null;
    return { type: "video_url", video_url: { url: videoUrl } };
  }

  return null;
}

function resolveAliyunVideoMime({ mime, ext }) {
  const normalizedMime = String(mime || "")
    .trim()
    .toLowerCase();
  if (normalizedMime.startsWith("video/")) {
    return normalizedMime.split(";")[0] || "";
  }

  const normalizedExt = String(ext || "")
    .trim()
    .toLowerCase();
  if (normalizedExt === "mp4") return "video/mp4";
  if (normalizedExt === "mpeg" || normalizedExt === "mpg") return "video/mpeg";
  if (normalizedExt === "mov") return "video/quicktime";
  if (normalizedExt === "avi") return "video/x-msvideo";
  if (normalizedExt === "webm") return "video/webm";
  if (normalizedExt === "mkv") return "video/x-matroska";
  if (normalizedExt === "wmv") return "video/x-ms-wmv";
  if (normalizedExt === "flv") return "video/x-flv";
  return "";
}

async function resolveAliyunDashScopeAttachmentUrl({
  ossFile = null,
  fallbackFileName = "",
} = {}) {
  const normalizePublicUrl = (value) => {
    const safeUrl = sanitizeGroupChatHttpUrl(value);
    if (!safeUrl) return "";
    try {
      const parsed = new URL(safeUrl);
      const host = normalizeGroupChatOssPublicEndpoint(parsed.hostname);
      if (host) {
        parsed.hostname = host;
      }
      return parsed.toString();
    } catch {
      return safeUrl;
    }
  };
  if (!ossFile || typeof ossFile !== "object") return "";
  const ossKey = sanitizeGroupChatOssObjectKey(ossFile?.ossKey);
  const fileName = sanitizeGroupChatFileName(ossFile?.fileName || fallbackFileName);
  if (ossKey) {
    const signedUrl = await buildGroupChatFileSignedDownloadUrl({
      ossKey,
      fileName,
    });
    const safeSignedUrl = normalizePublicUrl(signedUrl);
    if (safeSignedUrl) return safeSignedUrl;
  }
  return normalizePublicUrl(ossFile?.fileUrl);
}

function buildAliyunDashScopeDocumentUrlPart({ url = "", mime = "", fileName = "" } = {}) {
  const safeUrl = sanitizeGroupChatHttpUrl(url);
  if (!safeUrl) return null;

  const filePayload = { url: safeUrl };
  const safeMime = sanitizeGroupChatFileMimeType(mime);
  if (safeMime && safeMime !== "application/octet-stream") {
    filePayload.mime_type = safeMime;
  }
  const safeName = sanitizeText(fileName, "", 180);
  if (safeName) {
    filePayload.name = safeName;
  }
  return { type: "file_url", file_url: filePayload };
}

function shouldForceAliyunDashScopeLocalParseForFile({ ext = "", mime = "", buffer = null } = {}) {
  if (isPdfFile(ext, mime)) return true;
  if (isWordFile(ext, mime)) return true;
  if (isExcelFile(ext, mime)) return true;
  if (isTextLikeFile(ext, mime, buffer)) return true;
  return false;
}

async function renderPdfToAliyunDashScopeImagesWithPython({
  inputPath = "",
  outputDir = "",
  maxPages = ALIYUN_DASHSCOPE_PDF_IMAGE_MAX_PAGES,
  dpi = ALIYUN_DASHSCOPE_PDF_RENDER_DPI,
} = {}) {
  const safeInputPath = String(inputPath || "").trim();
  const safeOutputDir = String(outputDir || "").trim();
  if (!safeInputPath || !safeOutputDir) {
    return { ok: false, pageCount: 0, renderedPaths: [], error: "missing pdf path" };
  }

  const safeMaxPages = Math.max(1, Math.min(50, Number(maxPages) || 1));
  const safeDpi = Math.max(96, Math.min(300, Number(dpi) || ALIYUN_DASHSCOPE_PDF_RENDER_DPI));
  const scriptPath = ALIYUN_DASHSCOPE_PDF_RENDER_SCRIPT_PATH;
  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      pageCount: 0,
      renderedPaths: [],
      error: "missing scripts/aliyun_pdf_to_images.py",
    };
  }

  try {
    const { stdout = "" } = await execFileAsync(
      "python3",
      [
        scriptPath,
        safeInputPath,
        safeOutputDir,
        String(safeMaxPages),
        String(safeDpi),
      ],
      {
        timeout: ALIYUN_DASHSCOPE_PDF_RENDER_TIMEOUT_MS,
        maxBuffer: ALIYUN_DASHSCOPE_PDF_RENDER_STDOUT_MAX_BYTES,
      },
    );
    const lastJsonLine =
      String(stdout || "")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .pop() || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(lastJsonLine);
    } catch {
      parsed = {};
    }
    const renderedPaths = Array.isArray(parsed?.rendered)
      ? parsed.rendered.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const pageCount = Math.max(0, Number(parsed?.page_count) || 0);
    const ok = !!parsed?.ok;
    const errorMessage = sanitizeText(parsed?.error, "", 600);
    return {
      ok,
      pageCount,
      renderedPaths,
      error: errorMessage,
    };
  } catch (error) {
    return {
      ok: false,
      pageCount: 0,
      renderedPaths: [],
      error: sanitizeText(error?.message, "python render failed", 600),
    };
  }
}

async function buildAliyunDashScopePdfImageParts(
  file,
  {
    userId = "",
    sessionId = "",
    ossScope = CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE,
  } = {},
) {
  const safeBuffer = Buffer.isBuffer(file?.buffer) ? file.buffer : Buffer.from([]);
  if (safeBuffer.length === 0) {
    return { parts: [], pageCount: 0, error: "empty pdf buffer", ossFiles: [] };
  }
  if (!groupChatOssClient || !groupChatOssConfig) {
    return {
      parts: [],
      pageCount: 0,
      error: "OSS 未配置，无法处理 PDF 图片。",
      ossFiles: [],
    };
  }
  const safeName = sanitizeText(file?.originalname, "document.pdf", 180);
  let tempDir = "";
  try {
    tempDir = await mkdtemp(path.join(tmpdir(), "educhat-aliyun-pdf-"));
    const inputPath = path.join(tempDir, "input.pdf");
    const outputDir = path.join(tempDir, "rendered");
    await writeFileAsync(inputPath, safeBuffer);
    await mkdir(outputDir, { recursive: true });

    const rendered = await renderPdfToAliyunDashScopeImagesWithPython({
      inputPath,
      outputDir,
      maxPages: ALIYUN_DASHSCOPE_PDF_IMAGE_MAX_PAGES,
      dpi: ALIYUN_DASHSCOPE_PDF_RENDER_DPI,
    });
    const imageParts = [];
    const imageOssFiles = [];
    const baseName = safeName.replace(/\.[a-z0-9]+$/i, "") || "document";
    for (let idx = 0; idx < rendered.renderedPaths.length; idx += 1) {
      const renderedPath = rendered.renderedPaths[idx];
      const imageBuffer = await readFileAsync(renderedPath).catch(() => Buffer.from([]));
      if (!imageBuffer.length) continue;

      const uploaded = await uploadBufferToGroupChatOss({
        scope: ossScope,
        userId,
        sessionId,
        fileName: `${baseName}-page-${idx + 1}.jpg`,
        mimeType: "image/jpeg",
        dataBuffer: imageBuffer,
        cacheControl: "private, no-store",
      });
      if (!uploaded) continue;

      const ossFile = {
        fileName: sanitizeGroupChatFileName(uploaded.fileName),
        mimeType: sanitizeGroupChatFileMimeType(uploaded.mimeType),
        size: sanitizeRuntimeInteger(
          uploaded.size,
          imageBuffer.length,
          0,
          GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
        ),
        source: "prepared-pdf-image",
        ossKey: sanitizeGroupChatOssObjectKey(uploaded.ossKey),
        ossBucket: sanitizeAliyunOssBucket(uploaded.ossBucket),
        ossRegion: sanitizeAliyunOssRegion(uploaded.ossRegion),
        fileUrl: sanitizeGroupChatHttpUrl(uploaded.fileUrl),
      };
      const imageUrl = await resolveAliyunDashScopeAttachmentUrl({
        ossFile,
        fallbackFileName: ossFile.fileName,
      });
      if (!imageUrl) continue;

      imageOssFiles.push(ossFile);
      imageParts.push({ type: "image_url", image_url: { url: imageUrl } });
    }
    if (imageParts.length === 0) {
      return {
        parts: [],
        pageCount: rendered.pageCount,
        error: rendered.error || "pdf rendered with no pages",
        ossFiles: [],
      };
    }

    const summaryLines = [
      `[附件: ${safeName}]`,
      "已按阿里云官方建议，将 PDF 按页转换为图片后输入模型。",
    ];
    if (rendered.pageCount > imageParts.length) {
      summaryLines.push(
        `PDF 共 ${rendered.pageCount} 页，本次仅发送前 ${imageParts.length} 页。`,
      );
    }
    return {
      parts: [{ type: "text", text: summaryLines.join("\n") }, ...imageParts],
      pageCount: rendered.pageCount,
      error: "",
      ossFiles: imageOssFiles,
    };
  } catch (error) {
    return {
      parts: [],
      pageCount: 0,
      error: sanitizeText(error?.message, "pdf render failed", 600),
      ossFiles: [],
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function buildAliyunDashScopeFileInputParts(
  file,
  {
    ossFile = null,
    userId = "",
    sessionId = "",
    aliyunFileProcessMode = "local_parse",
  } = {},
) {
  const safeBuffer = Buffer.isBuffer(file?.buffer) ? file.buffer : Buffer.from([]);
  if (safeBuffer.length === 0) return [];

  const mime = String(file?.mimetype || "")
    .trim()
    .toLowerCase();
  const ext = getFileExtension(file?.originalname);
  const safeName = sanitizeText(file?.originalname, "upload.bin", 180);

  if (mime.startsWith("image/")) {
    const urlFromOss = await resolveAliyunDashScopeAttachmentUrl({
      ossFile,
      fallbackFileName: safeName,
    });
    if (urlFromOss) {
      return [{ type: "image_url", image_url: { url: urlFromOss } }];
    }
    return [];
  }

  const videoMime = resolveAliyunVideoMime({ mime, ext });
  if (videoMime) {
    const urlFromOss = await resolveAliyunDashScopeAttachmentUrl({
      ossFile,
      fallbackFileName: safeName,
    });
    if (urlFromOss) {
      return [{ type: "video_url", video_url: { url: urlFromOss } }];
    }
    const videoUrl = buildDataUrlForBuffer(safeBuffer, videoMime);
    if (videoUrl) {
      return [{ type: "video_url", video_url: { url: videoUrl } }];
    }
  }

  if (isPdfFile(ext, mime)) {
    const converted = await buildAliyunDashScopePdfImageParts(file, {
      userId,
      sessionId,
      ossScope: CHAT_PREPARED_PDF_IMAGE_OSS_SCOPE,
    });
    if (converted.parts.length > 0) {
      return converted.parts;
    }
    if (converted.error) {
      console.warn(
        `[aliyun/dashscope] PDF 转图片失败（${safeName}），回退本地文本解析：${converted.error}`,
      );
    }
    return [];
  }

  if (shouldForceAliyunDashScopeLocalParseForFile({ ext, mime, buffer: safeBuffer })) {
    return [];
  }

  const normalizedFileMode = sanitizeAliyunFileProcessMode(aliyunFileProcessMode);
  if (normalizedFileMode === "native_oss_url") {
    const urlFromOss = await resolveAliyunDashScopeAttachmentUrl({
      ossFile,
      fallbackFileName: safeName,
    });
    if (urlFromOss) {
      const docPart = buildAliyunDashScopeDocumentUrlPart({
        url: urlFromOss,
        mime,
        fileName: safeName,
      });
      if (docPart) return [docPart];
    }
  }

  return [];
}

async function buildParsedFilePreviewTextPart(
  file,
  { maxChars = MAX_PARSED_CHARS_PER_FILE } = {},
) {
  const mime = file?.mimetype || "application/octet-stream";
  let textContent = "";
  let formatHint = "";

  try {
    const parsed = await parseFileContent(file);
    textContent = parsed.text;
    formatHint = parsed.hint;
  } catch (error) {
    textContent = "";
    formatHint = `解析失败: ${error?.message || "unknown error"}`;
  }

  const normalized = clipText(textContent, maxChars);
  const fallbackPreview = `${String(
    Buffer.isBuffer(file?.buffer) ? file.buffer.toString("base64") : "",
  ).slice(0, 1600)}...`;
  const preview = normalized || fallbackPreview;
  const note =
    formatHint ||
    (normalized
      ? "已解析文本内容。"
      : "暂未支持该二进制格式，以下为 base64 预览。");

  return {
    type: "text",
    text: `\n[附件: ${file?.originalname || "未命名文件"}]\nMIME: ${mime}\n说明: ${note}\n内容预览:\n${preview}`,
  };
}

async function attachFilesToLatestUserMessageForOpenRouter(
  messages,
  files,
  { ossFiles = [] } = {},
) {
  const msg = resolveLatestUserMessage(messages);
  if (!msg) return null;

  const parts = buildInitialAttachmentParts(msg.content);
  const safeOssFiles = Array.isArray(ossFiles) ? ossFiles : [];
  for (const file of files) {
    const openRouterPart = await buildOpenRouterFileInputPart(file, {
      ossFile: resolveUploadedContextOssFileForInputFile(file, safeOssFiles),
    });
    if (openRouterPart) {
      parts.push(openRouterPart);
      continue;
    }
    const mime = String(file?.mimetype || "")
      .trim()
      .toLowerCase();
    if (mime.startsWith("image/")) {
      throw new Error("图片附件上传到 OSS 失败，请重试。");
    }

    const fallback = await buildParsedFilePreviewTextPart(file);
    if (fallback) parts.push(fallback);
  }

  if (parts.length === 0) return null;
  msg.content = parts;
  return {
    messageId: sanitizeId(msg.id, ""),
    content: parts,
  };
}

async function attachFilesToLatestUserMessageForAliyunDashScope(
  messages,
  files,
  {
    ossFiles = [],
    userId = "",
    sessionId = "",
    aliyunFileProcessMode = "local_parse",
  } = {},
) {
  const msg = resolveLatestUserMessage(messages);
  if (!msg) return null;

  const parts = buildInitialAttachmentParts(msg.content);
  const safeOssFiles = Array.isArray(ossFiles) ? ossFiles : [];
  for (let idx = 0; idx < files.length; idx += 1) {
    const file = files[idx];
    const ossFile =
      safeOssFiles[idx] || resolveUploadedContextOssFileForInputFile(file, safeOssFiles);
    const resolvedParts = await buildAliyunDashScopeFileInputParts(file, {
      ossFile,
      userId,
      sessionId,
      aliyunFileProcessMode,
    });
    if (Array.isArray(resolvedParts) && resolvedParts.length > 0) {
      parts.push(...resolvedParts);
      continue;
    }
    const mime = String(file?.mimetype || "")
      .trim()
      .toLowerCase();
    if (mime.startsWith("image/")) {
      throw new Error("图片附件上传到 OSS 失败，请重试。");
    }
    const fallback = await buildParsedFilePreviewTextPart(file, {
      maxChars: ALIYUN_DASHSCOPE_PARSED_DOC_MAX_CHARS,
    });
    if (fallback) {
      parts.push(fallback);
    }
  }

  if (parts.length === 0) return null;
  msg.content = parts;
  return {
    messageId: sanitizeId(msg.id, ""),
    content: cloneNormalizedMessageContent(parts),
  };
}

async function attachFilesToLatestUserMessageByLocalParsing(
  messages,
  files,
  { ossFiles = [] } = {},
) {
  const msg = resolveLatestUserMessage(messages);
  if (!msg) return null;

  const parts = buildInitialAttachmentParts(msg.content);
  const safeOssFiles = Array.isArray(ossFiles) ? ossFiles : [];
  for (const file of files) {
    const mime = String(file?.mimetype || "application/octet-stream")
      .trim()
      .toLowerCase();

    if (mime.startsWith("image/")) {
      const imageUrlFromOss = await resolveAliyunDashScopeAttachmentUrl({
        ossFile: resolveUploadedContextOssFileForInputFile(file, safeOssFiles),
        fallbackFileName: sanitizeText(file?.originalname, "image.jpg", 180),
      });
      if (!imageUrlFromOss) {
        throw new Error("图片附件上传到 OSS 失败，请重试。");
      }
      parts.push({ type: "image_url", image_url: { url: imageUrlFromOss } });
      continue;
    }

    const fallback = await buildParsedFilePreviewTextPart(file);
    if (fallback) parts.push(fallback);
  }

  if (parts.length > 0) {
    msg.content = parts;
    return {
      messageId: sanitizeId(msg.id, ""),
      content: cloneNormalizedMessageContent(parts),
    };
  }

  return null;
}

async function streamAgentEResponse({
  res,
  messages,
  files = [],
  volcengineFileRefs = [],
  preparedAttachmentRefs = [],
  runtimeOverride = null,
  chatUserId = "",
  sessionId = "",
  smartContextEnabled = false,
  contextMode = "append",
  attachUploadedFiles = true,
}) {
  const config = await readAgentEConfig();
  if (!config.enabled) {
    res.status(403).json({ error: "SSCI审稿人当前已被管理员禁用。" });
    return;
  }

  let runtime = sanitizeAgentERuntime(runtimeOverride, config.runtime);
  const effectiveProvider = AGENT_E_FIXED_PROVIDER;
  runtime = sanitizeSingleAgentRuntimeConfig(
    {
      ...runtime,
      provider: effectiveProvider,
    },
    "A",
  );
  runtime.provider = effectiveProvider;

  const selectedSkills = selectAgentESkills({
    messages,
    bindings: config.skills,
    maxSkills: config.skillPolicy?.maxSkillsPerTurn,
    autoSelect: !!config.skillPolicy?.autoSelect,
  });
  const composedSystemPrompt = buildAgentESystemPrompt({
    config,
    selectedSkills,
  });

  await streamAgentResponse({
    res,
    agentId: AGENT_E_ID,
    messages,
    files,
    volcengineFileRefs,
    preparedAttachmentRefs,
    runtimeConfig: runtime,
    systemPromptOverride: composedSystemPrompt,
    providerOverride: effectiveProvider,
    modelOverride: runtime.model,
    metaExtras: {
      selectedSkills: selectedSkills.map((item) => item.id),
      skillStrictMode: !!config.skillPolicy?.strictMode,
      outputSchema: config.reviewPolicy?.forceStructuredOutput
        ? "ssci-problem-list-v1"
        : "ssci-problem-list-flex-v1",
      evidenceAnchorsRequired: !!config.reviewPolicy?.requireEvidenceAnchors,
      providerMode: "locked",
      providerLockedTo: effectiveProvider,
    },
    chatUserId,
    sessionId,
    smartContextEnabled,
    contextMode,
    attachUploadedFiles,
  });
}

async function streamAgentResponse({
  res,
  agentId,
  messages,
  files = [],
  volcengineFileRefs = [],
  preparedAttachmentRefs = [],
  runtimeConfig = null,
  systemPromptOverride = "",
  providerOverride = "",
  modelOverride = "",
  metaExtras = null,
  chatUserId = "",
  sessionId = "",
  smartContextEnabled = false,
  contextMode = "append",
  attachUploadedFiles = true,
}) {
  const hasSystemPromptOverride =
    typeof systemPromptOverride === "string" && !!systemPromptOverride.trim();
  const systemPrompt = hasSystemPromptOverride
    ? String(systemPromptOverride || "")
    : await getSystemPromptByAgent(agentId);
  const config = runtimeConfig || (await getResolvedAgentRuntimeConfig(agentId));
  const provider = providerOverride
    ? normalizeProvider(providerOverride)
    : getProviderByAgent(agentId, config);
  const model =
    sanitizeRuntimeModel(modelOverride) || getModelByAgent(agentId, config);
  const aliyunModelPolicy =
    provider === "aliyun" ? resolveAliyunModelPolicy(model) : null;
  const protocolInfo = resolveRequestProtocol(config.protocol, provider, model);
  if (!protocolInfo.supported) {
    res.status(400).json({ error: protocolInfo.message });
    return;
  }
  const protocol = protocolInfo.value;
  const aliyunFileProcessMode = sanitizeAliyunFileProcessMode(
    config?.aliyunFileProcessMode,
  );
  const shouldUsePersistentFileContext =
    (provider === "volcengine" && protocol === "responses") ||
    (provider === "openrouter" && protocol === "chat") ||
    provider === "aliyun";
  const shouldKeepOnlyLatestAliyunFileContext =
    provider === "aliyun" && protocol === "dashscope";
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig.apiKey) {
    res.status(500).json({
      error: providerConfig.missingKeyMessage,
    });
    return;
  }
  const thinkingEnabled = sanitizeEnableThinking(config.enableThinking);
  const configuredThinkingEffort = sanitizeReasoningEffort(
    config?.thinkingEffort,
    DEFAULT_AGENT_RUNTIME_CONFIG.thinkingEffort,
  );
  const reasoningEffortRequested = thinkingEnabled ? configuredThinkingEffort : "none";
  const reasoning = resolveReasoningPolicy(
    model,
    reasoningEffortRequested,
    provider,
  );
  const webSearchRuntime = resolveProviderWebSearchRuntime({
    provider,
    protocol,
    model,
    config,
    thinkingEnabled,
  });
  const smartContextRuntime = await resolveSmartContextRuntime({
    requested: smartContextEnabled,
    provider,
    protocol,
    model,
    agentId,
    userId: chatUserId,
    sessionId,
    contextMode,
  });

  let safeMessages = normalizeMessages(messages);
  let filesForLocalAttach = Array.isArray(files) ? files.filter(Boolean) : [];
  let effectiveVolcengineFileRefs = sanitizeVolcengineFileRefsPayload(volcengineFileRefs);
  const effectivePreparedAttachmentRefs = sanitizePreparedAttachmentRefsPayload(
    preparedAttachmentRefs,
  );
  const preparedAttachmentResolution =
    attachUploadedFiles && effectivePreparedAttachmentRefs.length > 0
      ? resolvePreparedAttachmentRefsFromCache({
          refs: effectivePreparedAttachmentRefs,
          userId: chatUserId,
          sessionId,
          provider,
          protocol,
          agentId,
        })
      : { entries: [], missing: [], mismatched: [] };
  const preparedAttachmentEntries = Array.isArray(preparedAttachmentResolution?.entries)
    ? preparedAttachmentResolution.entries
    : [];
  if (
    attachUploadedFiles &&
    effectivePreparedAttachmentRefs.length > 0 &&
    (preparedAttachmentResolution.missing.length > 0 ||
      preparedAttachmentResolution.mismatched.length > 0)
  ) {
    res.status(400).json({
      error: "PDF 预处理结果已失效或与当前会话不匹配，请重新上传后再发送。",
    });
    return;
  }
  const hasPreparedAttachmentEntries = preparedAttachmentEntries.length > 0;
  if (
    provider === "volcengine" &&
    protocol !== "responses" &&
    attachUploadedFiles &&
    (filesForLocalAttach.length > 0 || effectiveVolcengineFileRefs.length > 0)
  ) {
    res.status(400).json({
      error: "火山引擎图片/文件仅支持 Responses 协议 Files API，请将 protocol 切换为 responses 后重试。",
    });
    return;
  }
  const hasLocalImageUpload =
    attachUploadedFiles && filesForLocalAttach.some((file) => isImageUploadFile(file));
  if (hasLocalImageUpload && !groupChatOssClient) {
    res.status(500).json({
      error: "图片附件需要先上传到阿里云 OSS，当前 OSS 未配置。",
    });
    return;
  }
  if (
    provider === "aliyun" &&
    aliyunModelPolicy &&
    !aliyunModelPolicy.allowImageInput
  ) {
    const hasImageInput =
      hasImageInputInMessages(safeMessages) ||
      filesForLocalAttach.some((file) => isImageUploadFile(file)) ||
      effectiveVolcengineFileRefs.some((item) => item.inputType === "input_image") ||
      preparedAttachmentEntries.some((item) => messageContainsImageInput(item?.parts));
    if (hasImageInput) {
      res.status(400).json({
        error: "当前阿里云 MiniMax 模型不支持图片输入，请仅发送文本内容。",
      });
      return;
    }
  }
  if (
    safeMessages.length === 0 &&
    attachUploadedFiles &&
    (filesForLocalAttach.length > 0 || hasPreparedAttachmentEntries)
  ) {
    safeMessages = [{ role: "user", content: "请基于附件内容进行分析和回答。" }];
  }

  if (safeMessages.length === 0) {
    res.status(400).json({ error: "Messages cannot be empty" });
    return;
  }

  const shouldSkipPersistentFileContextRehydrate =
    shouldKeepOnlyLatestAliyunFileContext &&
    attachUploadedFiles &&
    (filesForLocalAttach.length > 0 || hasPreparedAttachmentEntries);
  if (shouldUsePersistentFileContext && !shouldSkipPersistentFileContextRehydrate) {
    await rehydrateUploadedFileContexts(safeMessages, {
      userId: chatUserId,
      sessionId,
      provider,
      protocol,
      agentId,
      model,
      aliyunFileProcessMode,
    });
  }

  const narrowedMessages = pickRecentUserRounds(
    safeMessages,
    sanitizeRuntimeInteger(
      config.contextRounds,
      DEFAULT_AGENT_RUNTIME_CONFIG.contextRounds,
      1,
      RUNTIME_CONTEXT_ROUNDS_MAX,
    ),
  );

  let composedSystemPrompt = systemPrompt || "";
  if (
    sanitizeRuntimeBoolean(
      config.preventPromptLeak,
      DEFAULT_AGENT_RUNTIME_CONFIG.preventPromptLeak,
    )
  ) {
    composedSystemPrompt = [
      composedSystemPrompt,
      SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (
    sanitizeRuntimeBoolean(
      config.includeCurrentTime,
      DEFAULT_AGENT_RUNTIME_CONFIG.includeCurrentTime,
    )
  ) {
    const nowDateText = formatSystemDateYmd(new Date());
    composedSystemPrompt = [
      composedSystemPrompt,
      `系统日期（年月日）: ${nowDateText}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (config.injectSafetyPrompt) {
    composedSystemPrompt = [
      composedSystemPrompt,
      "请遵循安全与事实优先原则：不编造来源，不提供危险或违法行为的具体执行步骤。",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (webSearchRuntime.injectThinkingPrompt) {
    composedSystemPrompt = [
      composedSystemPrompt,
      VOLCENGINE_WEB_SEARCH_THINKING_PROMPT,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  let requestMessages = [...narrowedMessages];
  if (
    attachUploadedFiles &&
    (filesForLocalAttach.length > 0 || hasPreparedAttachmentEntries) &&
    !requestMessages.some((item) => item?.role === "user")
  ) {
    requestMessages.push({
      role: "user",
      content: "请基于附件内容进行分析和回答。",
    });
  }
  if (
    shouldUsePersistentFileContext &&
    effectiveVolcengineFileRefs.length > 0 &&
    !requestMessages.some((item) => item?.role === "user")
  ) {
    requestMessages.push({
      role: "user",
      content: "请基于附件内容进行分析和回答。",
    });
  }
  const aliyunDashScopeFallbackBaseMessages =
    provider === "aliyun" && protocol === "dashscope"
      ? normalizeMessages(requestMessages)
      : [];
  let uploadedAttachmentOssFilesForMeta = [];

  if (
    attachUploadedFiles &&
    filesForLocalAttach.length > 0 &&
    provider === "volcengine" &&
    protocol === "responses"
  ) {
    if (!providerConfig.filesEndpoint) {
      res.status(500).json({ error: "未配置火山引擎 Files API 端点。" });
      return;
    }
    try {
      const uploadedBundle = await uploadVolcengineMultipartFilesAsRefs({
        files: filesForLocalAttach,
        model,
        filesEndpoint: providerConfig.filesEndpoint,
        apiKey: providerConfig.apiKey,
        strictSupportedTypes: false,
      });
      filesForLocalAttach = uploadedBundle.fallbackFiles;
      const uploadedToOss = await uploadChatAttachmentsToOss({
        files: uploadedBundle.uploadedFiles,
        userId: chatUserId,
        sessionId,
        source: "stream-volcengine-files-api",
        stopOnError: false,
      });
      if (uploadedToOss.length > 0) {
        uploadedAttachmentOssFilesForMeta = dedupeUploadedFileContextOssFiles([
          ...uploadedAttachmentOssFilesForMeta,
          ...uploadedToOss,
        ]);
      }
      effectiveVolcengineFileRefs = sanitizeVolcengineFileRefsPayload([
        ...effectiveVolcengineFileRefs,
        ...uploadedBundle.uploadedRefs,
      ]);
    } catch (error) {
      res.status(500).json({
        error: error?.message || "火山文件上传失败，请稍后重试。",
      });
      return;
    }
  }

  let uploadedContextOssFiles = [];
  if (attachUploadedFiles && filesForLocalAttach.length > 0 && groupChatOssClient) {
    try {
      uploadedContextOssFiles = await uploadChatAttachmentsToOss({
        files: filesForLocalAttach,
        userId: chatUserId,
        sessionId,
        source: `${provider}-${protocol}-local`,
        stopOnError: true,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "附件上传到 OSS 失败，请稍后重试。",
      });
      return;
    }
  }
  if (uploadedContextOssFiles.length > 0) {
    uploadedAttachmentOssFilesForMeta = dedupeUploadedFileContextOssFiles([
      ...uploadedAttachmentOssFilesForMeta,
      ...uploadedContextOssFiles,
    ]);
  }
  const turnUploadedAttachmentOssFiles = normalizeUploadedFileContextOssFiles(
    uploadedAttachmentOssFilesForMeta,
  );

  let uploadedFileContextRecord = null;
  if (attachUploadedFiles && filesForLocalAttach.length > 0) {
    try {
      uploadedFileContextRecord = await attachFilesToLatestUserMessage(
        requestMessages,
        filesForLocalAttach,
        {
          provider,
          protocol,
          model,
          ossFiles: uploadedContextOssFiles,
          userId: chatUserId,
          sessionId,
          aliyunFileProcessMode,
        },
      );
    } catch (error) {
      res.status(400).json({
        error: error?.message || "附件处理失败，请检查文件格式后重试。",
      });
      return;
    }
  }
  if (attachUploadedFiles && hasPreparedAttachmentEntries) {
    const preparedContextRecord = attachPreparedAttachmentPartsToLatestUserMessage(
      requestMessages,
      preparedAttachmentEntries,
    );
    if (!preparedContextRecord) {
      res.status(400).json({
        error: "PDF 预处理内容不可用，请重新上传后再试。",
      });
      return;
    }
    uploadedFileContextRecord = preparedContextRecord;
    const preparedOssFiles = dedupeUploadedFileContextOssFiles(
      preparedAttachmentEntries.flatMap((entry) =>
        normalizeUploadedFileContextOssFiles(entry?.extra?.ossFiles),
      ),
    );
    if (preparedOssFiles.length > 0) {
      uploadedContextOssFiles = dedupeUploadedFileContextOssFiles([
        ...uploadedContextOssFiles,
        ...preparedOssFiles,
      ]);
    }
  }
  if (shouldUsePersistentFileContext && uploadedFileContextRecord?.messageId) {
    await saveUploadedFileContext({
      userId: chatUserId,
      sessionId,
      messageId: uploadedFileContextRecord.messageId,
      content: uploadedFileContextRecord.content,
      preparedAttachmentTokens: uploadedFileContextRecord.usedTokens,
      ossFiles: uploadedContextOssFiles,
    });
    if (shouldKeepOnlyLatestAliyunFileContext) {
      await pruneUploadedFileContextsForSession({
        userId: chatUserId,
        sessionId,
        keepMessageId: uploadedFileContextRecord.messageId,
      });
    }
  }
  const uploadedAttachmentLinks = await buildUploadedAttachmentLinksForClient(
    turnUploadedAttachmentOssFiles,
  );
  if (
    shouldUsePersistentFileContext &&
    effectiveVolcengineFileRefs.length > 0
  ) {
    // Files API 文件（PDF/图片/视频）由火山侧保存 7 天，这里只在本次请求挂载 file_id，
    // 不再写入本地附件上下文库；本地库仅用于非 Files API 的本地解析文件。
    attachVolcengineFileRefsToLatestUserMessage(
      requestMessages,
      effectiveVolcengineFileRefs,
    );
  }
  if (provider === "volcengine" && protocol === "responses") {
    requestMessages = requestMessages.map((msg) => ({
      ...msg,
      content: keepVolcengineResponsesFileRefsOnly(msg?.content),
    }));
  }
  if (smartContextRuntime.usePreviousResponseId) {
    requestMessages = extractSmartContextIncrementalMessages(requestMessages);
  }

  let providerMessages = requestMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const promptLeakGuardEnabled = sanitizeRuntimeBoolean(
    config.preventPromptLeak,
    DEFAULT_AGENT_RUNTIME_CONFIG.preventPromptLeak,
  );
  const promptLeakDetected =
    promptLeakGuardEnabled && isPromptLeakProbeRequest(requestMessages);

  const aliyunSharedSampling =
    provider === "aliyun"
      ? {
          temperature: sanitizeRuntimeNumber(
            config.temperature,
            DEFAULT_AGENT_RUNTIME_CONFIG.temperature,
            0,
            2,
          ),
          topP: sanitizeRuntimeNumber(
            config.topP,
            DEFAULT_AGENT_RUNTIME_CONFIG.topP,
            0,
            1,
          ),
          frequencyPenalty: sanitizeRuntimeNumber(
            config.frequencyPenalty,
            DEFAULT_AGENT_RUNTIME_CONFIG.frequencyPenalty,
            -2,
            2,
          ),
          presencePenalty: sanitizeRuntimeNumber(
            config.presencePenalty,
            DEFAULT_AGENT_RUNTIME_CONFIG.presencePenalty,
            -2,
            2,
          ),
        }
      : null;

  let payload = null;
  if (provider === "aliyun") {

    if (protocol === "responses") {
      payload = buildAliyunResponsesPayload({
        model,
        messages: providerMessages,
        instructions: composedSystemPrompt,
        config,
        thinkingEnabled: reasoning.enabled,
        webSearchRuntime,
        previousResponseId: smartContextRuntime.previousResponseId,
        forceStore: smartContextRuntime.enabled,
        maxToolCalls: webSearchRuntime.maxToolCalls,
        buildResponsesInputItems,
      });
    } else if (protocol === "dashscope") {
      payload = buildAliyunDashScopePayload({
        model,
        messages: providerMessages,
        systemPrompt: composedSystemPrompt,
        config,
        thinkingEnabled: reasoning.enabled,
        webSearchRuntime,
        temperature: aliyunSharedSampling?.temperature,
        topP: aliyunSharedSampling?.topP,
      });
    } else {
      payload = buildAliyunChatPayload({
        model,
        messages: providerMessages,
        systemPrompt: composedSystemPrompt,
        config,
        thinkingEnabled: reasoning.enabled,
        webSearchRuntime,
        temperature: aliyunSharedSampling?.temperature,
        topP: aliyunSharedSampling?.topP,
        frequencyPenalty: aliyunSharedSampling?.frequencyPenalty,
        presencePenalty: aliyunSharedSampling?.presencePenalty,
      });
    }
  } else if (protocol === "responses") {
    payload = buildResponsesRequestPayload({
      model,
      messages: providerMessages,
      instructions: composedSystemPrompt,
      config,
      thinkingEnabled,
      reasoning,
      webSearchRuntime,
      previousResponseId: smartContextRuntime.previousResponseId,
      forceStore: smartContextRuntime.enabled,
    });
  } else {
    payload = buildChatRequestPayload({
      model,
      messages: providerMessages,
      systemPrompt: composedSystemPrompt,
      provider,
      config,
      reasoning,
    });
  }

  let useAliyunDashScopeMultimodalEndpoint =
    provider === "aliyun" &&
    protocol === "dashscope" &&
    shouldUseAliyunDashScopeMultimodalEndpoint({
      model,
      messages: providerMessages,
    });
  let endpoint =
    provider === "aliyun" && protocol === "dashscope"
      ? useAliyunDashScopeMultimodalEndpoint
        ? providerConfig.dashscopeMultimodalEndpoint || providerConfig.dashscopeEndpoint
        : providerConfig.dashscopeEndpoint
      : protocol === "responses"
        ? providerConfig.responsesEndpoint
        : providerConfig.chatEndpoint;
  if (!endpoint) {
    res.status(500).json({
      error: `当前 provider (${provider}) 未配置 ${protocol} 协议端点。`,
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const safeMetaExtras = metaExtras && typeof metaExtras === "object" ? metaExtras : {};
  writeEvent(res, "meta", {
    provider,
    protocol,
    model,
    thinkingEnabledRequested: thinkingEnabled,
    reasoningRequested: reasoningEffortRequested,
    reasoningApplied: reasoning.effort,
    reasoningEnabled: reasoning.enabled,
    reasoningForced: reasoning.forced,
    webSearchRequested: webSearchRuntime.requested,
    webSearchModelSupported: webSearchRuntime.modelSupported,
    webSearchMatchedModelId: webSearchRuntime.matchedModelId,
    webSearchEnabled: webSearchRuntime.enabled,
    webSearchThinkingPromptInjected: webSearchRuntime.injectThinkingPrompt,
    aliyunDashscopeMultimodalEndpointUsed: useAliyunDashScopeMultimodalEndpoint,
    aliyunFileProcessModeApplied: provider === "aliyun" ? aliyunFileProcessMode : "",
    smartContextRequested: smartContextRuntime.requested,
    smartContextEnabled: smartContextRuntime.enabled,
    smartContextUsePreviousResponseId: smartContextRuntime.usePreviousResponseId,
    smartContextSessionId: smartContextRuntime.sessionId,
    promptLeakGuardEnabled,
    promptLeakDetected,
    runtimeConfig: config,
    uploadedAttachmentLinks,
    ...safeMetaExtras,
  });

  let upstream;
  let aliyunNativeFileFallbackAttempted = false;
  const tryAliyunDashScopeNativeFileFallback = async (triggerText = "") => {
    if (aliyunNativeFileFallbackAttempted) return false;
    if (provider !== "aliyun" || protocol !== "dashscope") return false;
    if (aliyunFileProcessMode !== "native_oss_url") return false;
    if (!isAliyunDashScopeUnsupportedNativeFileErrorText(triggerText)) return false;
    aliyunNativeFileFallbackAttempted = true;

    const retryMessages = stripAliyunDocumentUrlPartsFromMessages(
      aliyunDashScopeFallbackBaseMessages,
    );
    if (
      attachUploadedFiles &&
      (filesForLocalAttach.length > 0 || hasPreparedAttachmentEntries)
    ) {
      let retryUploadedContextRecord = null;
      if (filesForLocalAttach.length > 0) {
        try {
          retryUploadedContextRecord = await attachFilesToLatestUserMessage(
            retryMessages,
            filesForLocalAttach,
            {
              provider,
              protocol,
              model,
              ossFiles: uploadedContextOssFiles,
              userId: chatUserId,
              sessionId,
              aliyunFileProcessMode: "local_parse",
            },
          );
        } catch {
          retryUploadedContextRecord = null;
        }
      }
      if (hasPreparedAttachmentEntries) {
        const retryPreparedRecord = attachPreparedAttachmentPartsToLatestUserMessage(
          retryMessages,
          preparedAttachmentEntries,
        );
        if (retryPreparedRecord) {
          retryUploadedContextRecord = retryPreparedRecord;
        }
      }
      if (retryUploadedContextRecord) {
        uploadedFileContextRecord = retryUploadedContextRecord;
      }
      if (shouldUsePersistentFileContext && retryUploadedContextRecord?.messageId) {
        await saveUploadedFileContext({
          userId: chatUserId,
          sessionId,
          messageId: retryUploadedContextRecord.messageId,
          content: retryUploadedContextRecord.content,
          preparedAttachmentTokens: retryUploadedContextRecord.usedTokens,
          ossFiles: uploadedContextOssFiles,
        });
        if (shouldKeepOnlyLatestAliyunFileContext) {
          await pruneUploadedFileContextsForSession({
            userId: chatUserId,
            sessionId,
            keepMessageId: retryUploadedContextRecord.messageId,
          });
        }
      }
    }

    if (retryMessages.length === 0) return false;
    providerMessages = retryMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    payload = buildAliyunDashScopePayload({
      model,
      messages: providerMessages,
      systemPrompt: composedSystemPrompt,
      config,
      thinkingEnabled: reasoning.enabled,
      webSearchRuntime,
      temperature: aliyunSharedSampling?.temperature,
      topP: aliyunSharedSampling?.topP,
    });
    useAliyunDashScopeMultimodalEndpoint = shouldUseAliyunDashScopeMultimodalEndpoint({
      model,
      messages: providerMessages,
    });
    endpoint = useAliyunDashScopeMultimodalEndpoint
      ? providerConfig.dashscopeMultimodalEndpoint || providerConfig.dashscopeEndpoint
      : providerConfig.dashscopeEndpoint;
    if (!endpoint) return false;

    try {
      upstream = await sendProviderRequestWithRetry({
        endpoint,
        headers: buildProviderHeaders(provider, providerConfig.apiKey, protocol),
        body: JSON.stringify(payload),
        provider,
        protocol,
      });
    } catch {
      return false;
    }

    console.warn(
      "[aliyun/dashscope] native document URL unsupported by upstream, fallback to local_parse for this request.",
    );
    return true;
  };

  if (promptLeakDetected) {
    writeEvent(res, "token", { text: "稍等，我来啦" });
    writeEvent(res, "done", { ok: true });
    res.end();
    return;
  }

  try {
    upstream = await sendProviderRequestWithRetry({
      endpoint,
      headers: buildProviderHeaders(provider, providerConfig.apiKey, protocol),
      body: JSON.stringify(payload),
      provider,
      protocol,
    });
  } catch (error) {
    console.error(`[${provider}/${protocol}] request failed:`, error);
    const failureMessage = formatProviderRequestFailure(
      provider,
      protocol,
      endpoint,
      error,
    );
    writeEvent(res, "error", {
      message: failureMessage,
    });
    res.end();
    return;
  }

  if (!upstream.ok || !upstream.body) {
    let detail = await safeReadText(upstream);
    console.error(`[${provider}/${protocol}] upstream error:`, upstream.status, detail);
    await tryAliyunDashScopeNativeFileFallback(detail);
    if (!upstream.ok || !upstream.body) {
      detail = await safeReadText(upstream);
      if (
        smartContextRuntime.usePreviousResponseId &&
        shouldResetSmartContextReference(upstream.status, detail)
      ) {
        await clearSessionContextRef({
          userId: smartContextRuntime.userId,
          sessionId: smartContextRuntime.sessionId,
        });
      }
      const message = formatProviderUpstreamError(
        provider,
        protocol,
        upstream.status,
        detail,
      );
      writeEvent(res, "error", {
        message,
      });
      res.end();
      return;
    }
  }

  try {
    let responsesResult = null;
    if (provider === "aliyun" && protocol === "dashscope") {
      await pipeAliyunDashScopeSse(upstream, res, {
        reasoningEnabled: reasoning.enabled,
        emitSearchUsage: webSearchRuntime.enabled,
        writeEvent,
      });
    } else if (protocol === "responses") {
      responsesResult = await pipeResponsesSse(upstream, res, reasoning.enabled, {
        emitSearchUsage: webSearchRuntime.enabled,
      });
    } else {
      await pipeOpenRouterSse(upstream, res, reasoning.enabled);
    }
    if (smartContextRuntime.enabled && protocol === "responses") {
      const nextResponseId = sanitizeText(responsesResult?.responseId, "", 160);
      if (nextResponseId) {
        await saveSessionContextRef({
          userId: smartContextRuntime.userId,
          sessionId: smartContextRuntime.sessionId,
          previousResponseId: nextResponseId,
          provider,
          protocol,
          model,
          agentId,
        });
      }
    }
    writeEvent(res, "done", { ok: true });
  } catch (error) {
    let finalError = error;
    const fallbackApplied = await tryAliyunDashScopeNativeFileFallback(
      error?.message || "",
    );
    if (fallbackApplied && upstream?.ok && upstream?.body) {
      try {
        await pipeAliyunDashScopeSse(upstream, res, {
          reasoningEnabled: reasoning.enabled,
          emitSearchUsage: webSearchRuntime.enabled,
          writeEvent,
        });
        writeEvent(res, "done", { ok: true });
        return;
      } catch (retryError) {
        finalError = retryError;
      }
    }
    console.error(`[${provider}/${protocol}] stream handling failed:`, finalError);
    writeEvent(res, "error", { message: finalError?.message || "stream failed" });
  } finally {
    res.end();
  }
}

async function streamSeedreamImageGeneration({ res, body, files = [], chatUserId = "" }) {
  const imageConfig = getVolcengineImageGenerationConfig();
  if (!imageConfig.apiKey) {
    res.status(500).json({ error: imageConfig.missingKeyMessage });
    return;
  }

  let request = null;
  try {
    request = await buildSeedreamImageGenerationRequest({
      body,
      files,
      model: imageConfig.model,
      chatUserId,
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "图片输入参数不合法。" });
    return;
  }

  if (!request.prompt) {
    res.status(400).json({ error: "请输入图片生成提示词。" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeEvent(res, "meta", {
    model: request.payload.model,
    stream: request.payload.stream,
    responseFormat: request.payload.response_format,
    sequentialImageGeneration: request.payload.sequential_image_generation,
    maxImages: request.maxImages,
    inputImageCount: request.inputImageCount,
    size: request.payload.size || "default",
  });

  const generatedImageByIndex = new Map();
  const collectGeneratedImage = (payload) => {
    const imageIndex = sanitizeRuntimeInteger(payload?.imageIndex, 0, 0, 9999);
    const size = sanitizeText(payload?.size, "", 80);
    const model = sanitizeText(payload?.model, "", 160);
    const imageUrl = resolveGeneratedImageOutputUrl({
      url: payload?.url,
      b64Json: payload?.b64Json,
    });
    if (!imageUrl) return;
    generatedImageByIndex.set(String(imageIndex), {
      imageIndex,
      imageUrl,
      size,
      model,
    });
  };

  let upstream;
  try {
    upstream = await fetch(imageConfig.endpoint, {
      method: "POST",
      headers: buildImageGenerationHeaders(
        imageConfig.apiKey,
        request.payload.stream,
      ),
      body: JSON.stringify(request.payload),
    });
  } catch (error) {
    writeEvent(res, "error", {
      message: `volcengine/images request failed: ${error.message}`,
    });
    res.end();
    return;
  }

  if (!upstream.ok) {
    const detail = await safeReadText(upstream);
    console.error("[volcengine/images] upstream error:", upstream.status, detail);
    writeEvent(res, "error", {
      message: formatProviderUpstreamError(
        "volcengine",
        "images",
        upstream.status,
        detail,
      ),
    });
    res.end();
    return;
  }

  try {
    if (request.payload.stream) {
      if (!upstream.body) {
        throw new Error("图片生成上游未返回有效流式内容。");
      }
      await pipeVolcengineImageGenerationSse(upstream, res, {
        onImagePartial: collectGeneratedImage,
      });
    } else {
      const result = await safeReadJson(upstream);
      emitSeedreamImageGenerationNonStreamEvents(result, res, {
        onImagePartial: collectGeneratedImage,
      });
    }

    if (generatedImageByIndex.size > 0) {
      await saveGeneratedImageHistory({
        userId: chatUserId,
        prompt: request.prompt,
        responseFormat: request.payload.response_format,
        model: request.payload.model,
        images: Array.from(generatedImageByIndex.values()),
      });
    }
    writeEvent(res, "done", { ok: true });
  } catch (error) {
    writeEvent(res, "error", {
      message: error?.message || "图片生成失败，请稍后重试。",
    });
  } finally {
    res.end();
  }
}

async function buildSeedreamImageGenerationRequest({ body, files, model, chatUserId = "" }) {
  const prompt = sanitizeText(body?.prompt, "", 2000);
  const size = normalizeSeedreamSize(body?.size);
  const sequentialImageGeneration = normalizeSeedreamSequentialMode(
    body?.sequentialImageGeneration ?? body?.mode,
  );
  const stream = sanitizeRuntimeBoolean(body?.stream, true);
  const watermark = sanitizeRuntimeBoolean(body?.watermark, false);
  const responseFormat = normalizeSeedreamResponseFormat(body?.responseFormat);
  const imageUrls = parseSeedreamImageInputs(body?.imageUrls);
  const fileInputs = await buildSeedreamFileImageInputs({
    files,
    chatUserId,
  });
  const inputImages = [...imageUrls, ...fileInputs];
  if (inputImages.length > MAX_IMAGE_GENERATION_INPUT_FILES) {
    throw new Error(
      `输入图片数量超限，最多支持 ${MAX_IMAGE_GENERATION_INPUT_FILES} 张参考图。`,
    );
  }

  let maxImages = sanitizeRuntimeInteger(body?.maxImages, 15, 1, 15);
  if (sequentialImageGeneration === "auto") {
    const remaining = 15 - inputImages.length;
    if (remaining <= 0) {
      throw new Error(
        "组图模式下，输入参考图数量与输出图数量总和不能超过 15 张。",
      );
    }
    maxImages = Math.min(maxImages, remaining);
  }

  const payload = {
    model: String(model || DEFAULT_VOLCENGINE_IMAGE_GENERATION_MODEL),
    prompt,
    stream,
    response_format: responseFormat,
    watermark,
    sequential_image_generation: sequentialImageGeneration,
    optimize_prompt_options: { mode: "standard" },
  };

  if (size) {
    payload.size = size;
  }
  if (sequentialImageGeneration === "auto") {
    payload.sequential_image_generation_options = { max_images: maxImages };
  }
  if (inputImages.length === 1) {
    payload.image = inputImages[0];
  } else if (inputImages.length > 1) {
    payload.image = inputImages;
  }

  return {
    prompt,
    payload,
    inputImageCount: inputImages.length,
    maxImages,
  };
}

function normalizeSeedreamSize(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw === "2k") return "2K";
  if (raw === "4k") return "4K";
  const normalized = raw.replace(/[×]/g, "x");
  if (!/^\d{3,5}x\d{3,5}$/.test(normalized)) return "";
  return normalized;
}

function normalizeSeedreamSequentialMode(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "auto") return "auto";
  return "disabled";
}

function normalizeSeedreamResponseFormat(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "b64_json") return "b64_json";
  return "url";
}

function parseSeedreamImageInputs(raw) {
  const parsed = readJsonLikeField(raw, raw);
  let values = [];

  if (Array.isArray(parsed)) {
    values = parsed;
  } else if (typeof parsed === "string") {
    const text = parsed.trim();
    if (text) {
      values = text.includes("\n")
        ? text.split("\n")
        : text.includes(",")
          ? text.split(",")
          : [text];
    }
  }

  const deduped = new Set();
  const list = [];
  values.forEach((item) => {
    const url = String(item || "").trim();
    if (!url) return;
    if (!isSeedreamImageInputUrl(url)) return;
    if (deduped.has(url)) return;
    deduped.add(url);
    list.push(url);
  });
  return list;
}

function isSeedreamImageInputUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^https?:\/\//i.test(text) || /^data:image\//i.test(text);
}

async function buildSeedreamFileImageInputs({ files, chatUserId = "" }) {
  const safeFiles = Array.isArray(files) ? files : [];
  const list = [];
  for (let idx = 0; idx < safeFiles.length; idx += 1) {
    const file = safeFiles[idx];
    if (!file?.buffer) continue;
    const mime = normalizeSeedreamImageMimeType(file.mimetype);
    if (!mime) {
      throw new Error(
        `不支持的图片格式：${file.originalname || "未命名文件"}。仅支持 jpeg、png、webp、bmp、tiff、gif。`,
      );
    }
    const safeBuffer = extractGeneratedImageDataBuffer(file.buffer);
    if (!safeBuffer.length) continue;

    const fallbackDataUrl = `data:${mime};base64,${safeBuffer.toString("base64")}`;
    if (!groupChatOssClient || !groupChatOssConfig) {
      list.push(fallbackDataUrl);
      continue;
    }

    const ext = resolveFileExtensionByMimeType(mime, "png");
    const fallbackName = `seedream-input-${idx + 1}.${ext}`;
    const safeFileName = sanitizeGroupChatFileName(file?.originalname || fallbackName);
    try {
      const uploaded = await uploadBufferToGroupChatOss({
        scope: IMAGE_GENERATION_INPUT_OSS_SCOPE,
        userId: chatUserId,
        sessionId: "",
        fileName: safeFileName,
        mimeType: mime,
        dataBuffer: safeBuffer,
        cacheControl: "private, no-store",
      });
      const inputUrl = sanitizeGroupChatHttpUrl(uploaded?.fileUrl);
      if (inputUrl) {
        list.push(inputUrl);
      } else {
        list.push(fallbackDataUrl);
      }
    } catch (error) {
      throw new Error(
        `上传参考图到 OSS 失败（${safeFileName}）：${error?.message || "unknown error"}`,
      );
    }
  }
  return list;
}

function normalizeSeedreamImageMimeType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  if (key === "image/jpg") return "image/jpeg";
  if (
    key === "image/jpeg" ||
    key === "image/png" ||
    key === "image/webp" ||
    key === "image/bmp" ||
    key === "image/tiff" ||
    key === "image/gif"
  ) {
    return key;
  }
  return "";
}

async function pipeVolcengineImageGenerationSse(upstream, res, handlers = {}) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawCompleted = false;
  let sawAnyImageEvent = false;

  const processSseBlock = (block) => {
    const payload = extractSseDataPayload(block);
    if (!payload || payload === "[DONE]") return false;

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return false;
    }

    const type = String(json?.type || "")
      .trim()
      .toLowerCase();
    const model = sanitizeText(json?.model, "", 160);
    const created = Number.isFinite(Number(json?.created))
      ? Number(json.created)
      : null;
    const imageIndex = sanitizeRuntimeInteger(json?.image_index, 0, 0, 999);

    if (type === "image_generation.partial_succeeded") {
      sawAnyImageEvent = true;
      const partialPayload = {
        model,
        created,
        imageIndex,
        url: String(json?.url || ""),
        b64Json: String(json?.b64_json || ""),
        size: sanitizeText(json?.size, "", 80),
      };
      writeEvent(res, "image_partial", partialPayload);
      handlers.onImagePartial?.(partialPayload);
      return false;
    }

    if (type === "image_generation.partial_failed") {
      sawAnyImageEvent = true;
      const errorObj =
        json?.error && typeof json.error === "object" ? json.error : {};
      const code = sanitizeText(errorObj.code, "", 120);
      const message = mapVolcengineImageGenerationEventError({
        code,
        message: errorObj.message,
      });
      writeEvent(res, "image_failed", {
        model,
        created,
        imageIndex,
        errorCode: code,
        errorMessage: message,
      });
      return false;
    }

    if (type === "image_generation.completed") {
      sawCompleted = true;
      writeEvent(res, "usage", {
        model,
        created,
        usage: sanitizeImageGenerationUsage(json?.usage),
      });
      return true;
    }

    if (json?.error && typeof json.error === "object") {
      const code = sanitizeText(json.error.code, "", 120);
      const message = mapVolcengineUpstreamError({
        status: 400,
        code,
        message: json.error.message,
        param: "",
      });
      throw new Error(
        message ||
          mapVolcengineImageGenerationEventError({
            code,
            message: json.error.message,
          }),
      );
    }

    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = findSseEventBoundary(buffer);
    while (boundary.index !== -1) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.separatorLength);
      const completed = processSseBlock(block);
      if (completed) return;
      boundary = findSseEventBoundary(buffer);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    processSseBlock(tail);
  }

  if (!sawCompleted && !sawAnyImageEvent) {
    throw new Error("上游未返回有效图片生成结果。");
  }
}

function emitSeedreamImageGenerationNonStreamEvents(result, res, handlers = {}) {
  const payload = result && typeof result === "object" ? result : {};
  const model = sanitizeText(payload?.model, "", 160);
  const created = Number.isFinite(Number(payload?.created))
    ? Number(payload.created)
    : null;
  const data = Array.isArray(payload?.data) ? payload.data : [];

  data.forEach((item, idx) => {
    if (item && typeof item === "object" && item.error) {
      const errorObj =
        item.error && typeof item.error === "object" ? item.error : {};
      const code = sanitizeText(errorObj.code, "", 120);
      writeEvent(res, "image_failed", {
        model,
        created,
        imageIndex: idx,
        errorCode: code,
        errorMessage: mapVolcengineImageGenerationEventError({
          code,
          message: errorObj.message,
        }),
      });
      return;
    }

    const imageObj = item && typeof item === "object" ? item : {};
    const partialPayload = {
      model,
      created,
      imageIndex: idx,
      url: String(imageObj.url || ""),
      b64Json: String(imageObj.b64_json || ""),
      size: sanitizeText(imageObj.size, "", 80),
    };
    writeEvent(res, "image_partial", partialPayload);
    handlers.onImagePartial?.(partialPayload);
  });

  if (payload?.error && typeof payload.error === "object") {
    const code = sanitizeText(payload.error.code, "", 120);
    const mapped = mapVolcengineUpstreamError({
      status: 400,
      code,
      message: payload.error.message,
      param: "",
    });
    throw new Error(
      mapped ||
        mapVolcengineImageGenerationEventError({
          code,
          message: payload.error.message,
        }),
    );
  }

  writeEvent(res, "usage", {
    model,
    created,
    usage: sanitizeImageGenerationUsage(payload?.usage),
  });
}

function buildGeneratedImageHistoryExpireAt() {
  if (groupChatOssClient) return null;
  return new Date(Date.now() + GENERATED_IMAGE_HISTORY_TTL_MS);
}

function normalizeGeneratedImageHistoryResponseFormat(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "b64_json") return "b64_json";
  return "url";
}

function normalizeGeneratedImageStoreUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) {
    return text.slice(0, 4000);
  }
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(text)) {
    if (text.length > 12 * 1024 * 1024) return "";
    return text;
  }
  return "";
}

function normalizeGeneratedImageStorageType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "oss") return "oss";
  if (key === "binary") return "binary";
  return "remote";
}

function normalizeGeneratedImageMimeType(value) {
  const type = normalizeSeedreamImageMimeType(String(value || "").split(";")[0]);
  if (type) return type;
  return "";
}

function extractGeneratedImageDataBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (value && typeof value === "object") {
    if (typeof value.value === "function") {
      try {
        const binaryValue = value.value(true);
        if (Buffer.isBuffer(binaryValue)) {
          return Buffer.from(binaryValue);
        }
        if (ArrayBuffer.isView(binaryValue)) {
          return Buffer.from(binaryValue.buffer, binaryValue.byteOffset, binaryValue.byteLength);
        }
        if (binaryValue instanceof ArrayBuffer) {
          return Buffer.from(binaryValue);
        }
      } catch {
        // ignore binary conversion failures and fallback to other extraction strategies.
      }
    }
    if (Array.isArray(value?.data)) {
      return Buffer.from(value.data);
    }
    if (Buffer.isBuffer(value?.buffer)) {
      return Buffer.from(value.buffer);
    }
    if (ArrayBuffer.isView(value?.buffer)) {
      const nestedBuffer = Buffer.from(
        value.buffer.buffer,
        value.buffer.byteOffset,
        value.buffer.byteLength,
      );
      const position = Number(value?.position);
      if (Number.isFinite(position) && position > 0 && position < nestedBuffer.length) {
        return nestedBuffer.subarray(0, position);
      }
      return nestedBuffer;
    }
    if (value?.buffer instanceof ArrayBuffer) {
      return Buffer.from(value.buffer);
    }
  }
  return Buffer.from([]);
}

function parseGeneratedImageDataUrl(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match || !match[1] || !match[2]) return null;
  const mimeType = normalizeGeneratedImageMimeType(match[1]);
  if (!mimeType) return null;

  try {
    const data = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (!data.length || data.length > GENERATED_IMAGE_HISTORY_MAX_IMAGE_BYTES) return null;
    return {
      mimeType,
      data,
      size: data.length,
    };
  } catch {
    return null;
  }
}

function buildGeneratedImageHistoryContentPath(imageId) {
  const safeImageId = sanitizeId(imageId, "");
  if (!safeImageId) return "";
  return `/api/images/history/${encodeURIComponent(safeImageId)}/content`;
}

function resolveGeneratedImageOutputUrl({ url, b64Json }) {
  const direct = normalizeGeneratedImageStoreUrl(url);
  if (direct) return direct;

  const b64 = String(b64Json || "")
    .trim()
    .replace(/\s+/g, "");
  if (!b64) return "";
  return normalizeGeneratedImageStoreUrl(`data:image/png;base64,${b64}`);
}

async function fetchGeneratedImageBinaryFromUrl(imageUrl) {
  const safeUrl = normalizeGeneratedImageStoreUrl(imageUrl);
  if (!/^https?:\/\//i.test(safeUrl)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GENERATED_IMAGE_HISTORY_FETCH_TIMEOUT_MS);

  let response = null;
  try {
    response = await fetch(safeUrl, {
      method: "GET",
      headers: {
        Accept: "image/*",
      },
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response?.ok) return null;

  const mimeType = normalizeGeneratedImageMimeType(response.headers.get("content-type"));
  if (!mimeType) return null;

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > GENERATED_IMAGE_HISTORY_MAX_IMAGE_BYTES) {
    return null;
  }

  try {
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer || new ArrayBuffer(0));
    if (!data.length || data.length > GENERATED_IMAGE_HISTORY_MAX_IMAGE_BYTES) return null;
    return {
      mimeType,
      data,
      size: data.length,
    };
  } catch {
    return null;
  }
}

async function buildGeneratedImageBinaryPayload(imageUrl) {
  const parsedDataUrl = parseGeneratedImageDataUrl(imageUrl);
  if (parsedDataUrl) return parsedDataUrl;
  return fetchGeneratedImageBinaryFromUrl(imageUrl);
}

async function saveGeneratedImageHistory({
  userId,
  prompt,
  responseFormat,
  model,
  images,
}) {
  const safeUserId = sanitizeId(userId, "");
  if (!safeUserId) return;

  const safePrompt = sanitizeText(prompt, "", 2000);
  const safeResponseFormat = normalizeGeneratedImageHistoryResponseFormat(responseFormat);
  const safeModel = sanitizeText(model, "", 160);
  const sourceImages = Array.isArray(images) ? images : [];
  if (sourceImages.length === 0) return;

  const docs = (
    await Promise.all(
      sourceImages.slice(0, 20).map(async (item) => {
        const imageUrl = normalizeGeneratedImageStoreUrl(
          item?.imageUrl || item?.url || "",
        );
        if (!imageUrl) return null;

        const binaryPayload = await buildGeneratedImageBinaryPayload(imageUrl);
        const hasBinary = !!binaryPayload?.size && Buffer.isBuffer(binaryPayload?.data);
        let uploadedToOss = null;
        if (hasBinary && groupChatOssClient && groupChatOssConfig) {
          const ext = resolveFileExtensionByMimeType(binaryPayload?.mimeType, "png");
          const imageIndex = sanitizeRuntimeInteger(item?.imageIndex, 0, 0, 9999);
          const outputFileName = `seedream-output-${imageIndex + 1}.${ext}`;
          try {
            uploadedToOss = await uploadBufferToGroupChatOss({
              scope: IMAGE_GENERATION_OUTPUT_OSS_SCOPE,
              userId: safeUserId,
              sessionId: "",
              fileName: outputFileName,
              mimeType: binaryPayload.mimeType || "image/png",
              dataBuffer: binaryPayload.data,
              cacheControl: "private, no-store",
            });
          } catch (error) {
            console.warn(
              `[image-generation] 生成图片上传 OSS 失败（user=${safeUserId}, file=${outputFileName}）：`,
              error?.message || error,
            );
          }
        }
        return {
          userId: safeUserId,
          prompt: safePrompt,
          imageUrl: sanitizeGroupChatHttpUrl(uploadedToOss?.fileUrl) || imageUrl,
          imageStorageType: uploadedToOss ? "oss" : hasBinary ? "binary" : "remote",
          ossKey: sanitizeGroupChatOssObjectKey(uploadedToOss?.ossKey),
          ossBucket: sanitizeAliyunOssBucket(uploadedToOss?.ossBucket),
          ossRegion: sanitizeAliyunOssRegion(uploadedToOss?.ossRegion),
          imageMimeType: hasBinary ? binaryPayload.mimeType : "",
          imageSize: hasBinary ? binaryPayload.size : 0,
          imageData: uploadedToOss ? Buffer.alloc(0) : hasBinary ? binaryPayload.data : Buffer.alloc(0),
          responseFormat: safeResponseFormat,
          size: sanitizeText(item?.size, "", 80),
          model: sanitizeText(item?.model, safeModel, 160),
          expiresAt: buildGeneratedImageHistoryExpireAt(),
        };
      }),
    )
  ).filter(Boolean);
  if (docs.length === 0) return;

  try {
    await GeneratedImageHistory.insertMany(docs, { ordered: false });
  } catch (error) {
    console.warn(
      `Failed to persist generated image history (${safeUserId}):`,
      error?.message || error,
    );
  }
}

function toGeneratedImageHistoryItem(doc) {
  const id = sanitizeId(doc?._id, "");
  const storageType = normalizeGeneratedImageStorageType(doc?.imageStorageType);
  const storedContentPath =
    storageType === "binary" || storageType === "oss"
      ? buildGeneratedImageHistoryContentPath(id)
      : "";
  return {
    id,
    prompt: sanitizeText(doc?.prompt, "", 2000),
    url: storedContentPath || normalizeGeneratedImageStoreUrl(doc?.imageUrl || ""),
    responseFormat: normalizeGeneratedImageHistoryResponseFormat(doc?.responseFormat),
    size: sanitizeText(doc?.size, "", 80),
    model: sanitizeText(doc?.model, "", 160),
    createdAt: sanitizeIsoDate(doc?.createdAt) || new Date().toISOString(),
  };
}

function sanitizeImageGenerationUsage(raw) {
  const usage = raw && typeof raw === "object" ? raw : {};
  return {
    generatedImages: sanitizeRuntimeInteger(usage.generated_images, 0, 0, 9999),
    outputTokens: sanitizeRuntimeInteger(usage.output_tokens, 0, 0, 10_000_000),
    totalTokens: sanitizeRuntimeInteger(usage.total_tokens, 0, 0, 10_000_000),
  };
}

function mapVolcengineImageGenerationEventError({ code, message }) {
  const codeKey = String(code || "")
    .trim()
    .toLowerCase();
  const explicit = String(message || "").trim();

  if (
    codeKey.includes("outputimagesensitivecontentdetected") ||
    codeKey.includes("outputimageriskdetection")
  ) {
    return "生成的图像可能包含敏感信息，请调整提示词后重试。";
  }

  if (
    codeKey.includes("inputimagesensitivecontentdetected") ||
    codeKey.includes("inputimageriskdetection")
  ) {
    return "输入图片可能包含敏感信息，请更换后重试。";
  }

  if (codeKey.includes("invalidimageurl")) {
    return "输入图片无效，请检查图片链接或格式后重试。";
  }

  if (codeKey.includes("serveroverloaded")) {
    return "当前服务繁忙，请稍后重试。";
  }

  if (codeKey.includes("internalserviceerror")) {
    return "服务内部异常，请稍后重试。";
  }

  if (explicit) return explicit;
  return "图片生成失败，请稍后重试。";
}

function buildImageGenerationHeaders(apiKey, stream = true) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream, application/json" : "application/json",
  };
}

function getVolcengineImageGenerationConfig() {
  return {
    endpoint:
      process.env.VOLCENGINE_IMAGE_GENERATION_ENDPOINT ||
      DEFAULT_VOLCENGINE_IMAGE_GENERATION_ENDPOINT,
    model:
      process.env.VOLCENGINE_IMAGE_GENERATION_MODEL ||
      DEFAULT_VOLCENGINE_IMAGE_GENERATION_MODEL,
    apiKey: readEnvApiKey(
      "VOLCENGINE_IMAGE_API_KEY",
      "VOLCENGINE_SEEDREAM_API_KEY",
      "ARK_IMAGE_API_KEY",
    ),
    missingKeyMessage:
      "未检测到图片生成 API Key。请在 .env 中配置 VOLCENGINE_IMAGE_API_KEY（或 VOLCENGINE_SEEDREAM_API_KEY / ARK_IMAGE_API_KEY）。",
  };
}

function buildChatRequestPayload({
  model,
  messages,
  systemPrompt,
  provider,
  config,
  reasoning,
}) {
  const fixedSampling = isVolcengineFixedSamplingModel(model);
  const finalMessages = [];
  if (systemPrompt) {
    finalMessages.push({ role: "system", content: systemPrompt });
  }
  finalMessages.push(...messages);

  const payload = {
    model,
    stream: true,
    messages: finalMessages,
    temperature: fixedSampling
      ? VOLCENGINE_FIXED_TEMPERATURE
      : sanitizeRuntimeNumber(
          config.temperature,
          DEFAULT_AGENT_RUNTIME_CONFIG.temperature,
          0,
          2,
        ),
    top_p: fixedSampling
      ? VOLCENGINE_FIXED_TOP_P
      : sanitizeRuntimeNumber(
          config.topP,
          DEFAULT_AGENT_RUNTIME_CONFIG.topP,
          0,
          1,
        ),
    frequency_penalty: sanitizeRuntimeNumber(
      config.frequencyPenalty,
      DEFAULT_AGENT_RUNTIME_CONFIG.frequencyPenalty,
      -2,
      2,
    ),
    presence_penalty: sanitizeRuntimeNumber(
      config.presencePenalty,
      DEFAULT_AGENT_RUNTIME_CONFIG.presencePenalty,
      -2,
      2,
    ),
    max_tokens: sanitizeRuntimeInteger(
      config.maxOutputTokens,
      DEFAULT_AGENT_RUNTIME_CONFIG.maxOutputTokens,
      64,
      RUNTIME_MAX_OUTPUT_TOKENS,
    ),
  };
  if (reasoning.enabled) {
    payload.reasoning = { effort: reasoning.effort };
  }

  if (provider === "openrouter") {
    payload.include_reasoning = !!reasoning.enabled;

    const plugins = buildOpenRouterPlugins({ config });
    if (plugins.length > 0) {
      payload.plugins = plugins;
    }
  }

  return payload;
}

function buildOpenRouterPlugins({ config }) {
  const plugins = [];

  const pdfEngine = sanitizeOpenRouterPdfEngine(config?.openrouterPdfEngine);
  if (pdfEngine !== "auto") {
    plugins.push({
      id: "file-parser",
      pdf: { engine: pdfEngine },
    });
  }

  return plugins;
}

function buildResponsesRequestPayload({
  model,
  messages,
  instructions,
  config,
  thinkingEnabled,
  reasoning,
  webSearchRuntime,
  previousResponseId = "",
  forceStore = false,
}) {
  const input = buildResponsesInputItems(messages);
  const supportsReasoningEffort = supportsVolcengineResponsesReasoningEffort(model);
  const payload = {
    model,
    stream: true,
    input,
    max_output_tokens: sanitizeRuntimeInteger(
      config.maxOutputTokens,
      DEFAULT_AGENT_RUNTIME_CONFIG.maxOutputTokens,
      64,
      RUNTIME_MAX_OUTPUT_TOKENS,
    ),
    thinking: { type: thinkingEnabled ? "enabled" : "disabled" },
  };

  if (forceStore) {
    payload.store = true;
  }
  const safePreviousResponseId = sanitizeText(previousResponseId, "", 160);
  if (safePreviousResponseId) {
    payload.previous_response_id = safePreviousResponseId;
  }

  if (supportsReasoningEffort) {
    payload.reasoning = {
      effort: thinkingEnabled
        ? mapReasoningEffortToResponses(reasoning.effort)
        : "minimal",
    };
  }

  if (webSearchRuntime?.enabled && webSearchRuntime?.tool) {
    payload.tools = [webSearchRuntime.tool];
    payload.max_tool_calls = webSearchRuntime.maxToolCalls;
  }

  if (instructions) {
    payload.instructions = instructions;
  }

  return payload;
}

function resolveProviderWebSearchRuntime({
  provider,
  protocol,
  model,
  config,
  thinkingEnabled,
}) {
  if (provider === "aliyun") {
    const policy = resolveAliyunModelPolicy(model);
    const runtime = resolveAliyunWebSearchRuntime({
      protocol,
      config,
      model,
    });
    const modelSupported = policy.supported && !!policy.allowWebSearch;
    return {
      requested: runtime.requested,
      enabled: runtime.enabled,
      modelSupported,
      supportsThinking: modelSupported,
      matchedModelId: sanitizeRuntimeModel(model),
      maxToolCalls: runtime.maxToolCalls,
      tool: null,
      injectThinkingPrompt: false,
      options: runtime.options,
      tools: runtime.tools,
    };
  }

  return resolveVolcengineWebSearchRuntime({
    provider,
    protocol,
    model,
    config,
    thinkingEnabled,
  });
}

function resolveVolcengineWebSearchRuntime({
  provider,
  protocol,
  model,
  config,
  thinkingEnabled,
}) {
  const requested = sanitizeRuntimeBoolean(
    config?.enableWebSearch,
    DEFAULT_AGENT_RUNTIME_CONFIG.enableWebSearch,
  );
  const maxToolCalls = sanitizeRuntimeInteger(
    config?.webSearchMaxToolCalls,
    DEFAULT_AGENT_RUNTIME_CONFIG.webSearchMaxToolCalls,
    1,
    10,
  );
  const capability = resolveVolcengineWebSearchCapability(model);
  const isVolcengineResponses =
    provider === "volcengine" && protocol === "responses";
  const modelSupported = isVolcengineResponses && capability.supported;
  const supportsThinking = modelSupported && capability.supportsThinking;
  const enabled = requested && modelSupported;
  const tool = enabled ? buildWebSearchToolFromRuntimeConfig(config) : null;

  return {
    requested,
    enabled,
    modelSupported,
    supportsThinking,
    matchedModelId: capability.matchedModelId,
    maxToolCalls,
    tool,
    injectThinkingPrompt: enabled && supportsThinking && thinkingEnabled,
  };
}

function buildWebSearchToolFromRuntimeConfig(config) {
  const tool = {
    type: "web_search",
    max_keyword: sanitizeRuntimeInteger(
      config?.webSearchMaxKeyword,
      DEFAULT_AGENT_RUNTIME_CONFIG.webSearchMaxKeyword,
      1,
      50,
    ),
    limit: sanitizeRuntimeInteger(
      config?.webSearchResultLimit,
      DEFAULT_AGENT_RUNTIME_CONFIG.webSearchResultLimit,
      1,
      50,
    ),
    user_location: {
      type: "approximate",
      country: "中国",
      region: "浙江",
      city: "杭州",
    },
  };

  const sources = [];
  if (
    sanitizeRuntimeBoolean(
      config?.webSearchSourceDouyin,
      DEFAULT_AGENT_RUNTIME_CONFIG.webSearchSourceDouyin,
    )
  ) {
    sources.push("douyin");
  }
  if (
    sanitizeRuntimeBoolean(
      config?.webSearchSourceMoji,
      DEFAULT_AGENT_RUNTIME_CONFIG.webSearchSourceMoji,
    )
  ) {
    sources.push("moji");
  }
  if (
    sanitizeRuntimeBoolean(
      config?.webSearchSourceToutiao,
      DEFAULT_AGENT_RUNTIME_CONFIG.webSearchSourceToutiao,
    )
  ) {
    sources.push("toutiao");
  }
  if (sources.length > 0) {
    tool.sources = sources;
  }

  return tool;
}

function resolveVolcengineWebSearchCapability(model) {
  const candidates = getNormalizedModelCandidates(model);
  if (candidates.length === 0) {
    return { supported: false, supportsThinking: false, matchedModelId: "" };
  }

  const modelsFromEnv = readModelAllowlistFromEnv("VOLCENGINE_WEB_SEARCH_MODELS");
  if (modelsFromEnv.length > 0) {
    const supported = modelsFromEnv.some((alias) =>
      matchModelCandidates(candidates, alias),
    );
    if (!supported) {
      return { supported: false, supportsThinking: false, matchedModelId: "" };
    }

    const thinkingFromEnv = readModelAllowlistFromEnv(
      "VOLCENGINE_WEB_SEARCH_THINKING_MODELS",
    );
    const supportsThinking =
      thinkingFromEnv.length > 0
        ? thinkingFromEnv.some((alias) => matchModelCandidates(candidates, alias))
        : true;
    return { supported: true, supportsThinking, matchedModelId: "env" };
  }

  const matched = findVolcengineWebSearchCapabilityByModel(candidates);
  if (!matched) {
    return { supported: false, supportsThinking: false, matchedModelId: "" };
  }

  return {
    supported: true,
    supportsThinking: !!matched.supportsThinking,
    matchedModelId: matched.id,
  };
}

function findVolcengineWebSearchCapabilityByModel(candidates) {
  let best = null;

  VOLCENGINE_WEB_SEARCH_MODEL_CAPABILITIES.forEach((item) => {
    const aliases = Array.isArray(item.aliases) ? item.aliases : [];
    aliases.forEach((aliasRaw) => {
      const alias = String(aliasRaw || "")
        .trim()
        .toLowerCase();
      if (!alias) return;

      candidates.forEach((candidate) => {
        if (!candidate) return;
        const exact = candidate === alias;
        const includes = !exact && candidate.includes(alias);
        if (!exact && !includes) return;

        const score = (exact ? 1000 : 100) + alias.length;
        if (!best || score > best.score) {
          best = { item, score };
        }
      });
    });
  });

  return best?.item || null;
}

function getNormalizedModelCandidates(model) {
  const normalized = String(model || "")
    .trim()
    .toLowerCase();
  if (!normalized) return [];

  const set = new Set([normalized]);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex > -1 && slashIndex < normalized.length - 1) {
    set.add(normalized.slice(slashIndex + 1));
  }
  return Array.from(set);
}

function readModelAllowlistFromEnv(envName) {
  return String(process.env[envName] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchModelCandidates(candidates, aliasRaw) {
  const alias = String(aliasRaw || "")
    .trim()
    .toLowerCase();
  if (!alias) return false;
  return candidates.some((candidate) => candidate === alias || candidate.includes(alias));
}

function resolveRuntimeTokenProfileByModel(model) {
  const candidates = getNormalizedModelCandidates(model);
  if (candidates.length === 0) return null;

  let best = null;
  RESPONSE_MODEL_TOKEN_PROFILES.forEach((profile) => {
    const aliases = Array.isArray(profile.aliases) ? profile.aliases : [];
    aliases.forEach((aliasRaw) => {
      const alias = String(aliasRaw || "")
        .trim()
        .toLowerCase();
      if (!alias) return;

      candidates.forEach((candidate) => {
        if (!candidate) return;
        const exact = candidate === alias;
        const includes = !exact && candidate.includes(alias);
        if (!exact && !includes) return;

        const score = (exact ? 1000 : 100) + alias.length;
        if (!best || score > best.score) {
          best = { profile, score };
        }
      });
    });
  });

  if (!best) return null;
  return {
    contextWindowTokens: best.profile.contextWindowTokens,
    maxInputTokens: best.profile.maxInputTokens,
    maxOutputTokens: best.profile.maxOutputTokens,
    maxReasoningTokens: best.profile.maxReasoningTokens,
    matchedModelId: best.profile.id,
  };
}

function isVolcengineFixedSamplingModel(model) {
  const matched = resolveRuntimeTokenProfileByModel(model);
  return matched?.matchedModelId === VOLCENGINE_FIXED_SAMPLING_MODEL_ID;
}

function buildResponsesInputItems(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";

  const items = messages
    .map((message) => {
      const role = String(message?.role || "")
        .trim()
        .toLowerCase();
      if (role !== "user" && role !== "assistant" && role !== "system") return null;

      const content = normalizeResponsesMessageContent(message?.content);
      if (typeof content === "string" && !content.trim()) return null;
      if (Array.isArray(content) && content.length === 0) return null;

      return { role, content };
    })
    .filter(Boolean);

  if (items.length === 0) return "";

  if (items.length === 1 && items[0].role === "user" && typeof items[0].content === "string") {
    return items[0].content;
  }

  return items;
}

function normalizeResponsesMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const type = String(part.type || "")
      .trim()
      .toLowerCase();

    if (type === "text" || type === "input_text" || type === "output_text") {
      const text = String(part.text || "").trim();
      if (text) {
        parts.push({ type: "input_text", text });
      }
      continue;
    }

    if (type === "image_url" || type === "input_image") {
      const fileId = String(part.file_id || part.fileId || "").trim();
      if (fileId) {
        parts.push({ type: "input_image", file_id: fileId });
        continue;
      }
      const imageUrl = extractInputImageUrl(part);
      if (imageUrl) {
        parts.push({ type: "input_image", image_url: imageUrl });
      }
      continue;
    }

    if (type === "input_file" || type === "input_video") {
      const fileId = String(part.file_id || part.fileId || "").trim();
      if (fileId) {
        parts.push({ type, file_id: fileId });
      }
    }
  }

  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].type === "input_text") {
    return parts[0].text;
  }
  return parts;
}

function keepVolcengineResponsesFileRefsOnly(content) {
  if (typeof content === "string") return content;
  const normalized = normalizeMessageContent(content);
  if (!Array.isArray(normalized)) return "";

  const parts = [];
  normalized.forEach((part) => {
    const type = String(part?.type || "")
      .trim()
      .toLowerCase();
    if (type === "text" || type === "input_text" || type === "output_text") {
      const text = String(part?.text || "");
      if (text.trim()) {
        parts.push({ type: "text", text });
      }
      return;
    }
    if (type === "input_image" || type === "input_file" || type === "input_video") {
      const fileId = String(part?.file_id || part?.fileId || "").trim();
      if (fileId) {
        parts.push({ type, file_id: fileId });
      }
    }
  });

  if (parts.length === 0) return "";
  return parts;
}

function extractInputImageUrl(part) {
  if (typeof part.image_url === "string") {
    const direct = part.image_url.trim();
    return direct || "";
  }

  if (part.image_url && typeof part.image_url === "object") {
    const nested = String(part.image_url.url || "").trim();
    if (nested) return nested;
  }

  const url = String(part.url || "").trim();
  return url || "";
}

function extractInputVideoUrl(part) {
  if (typeof part.video_url === "string") {
    const direct = part.video_url.trim();
    return direct || "";
  }

  if (part.video_url && typeof part.video_url === "object") {
    const nested = String(part.video_url.url || "").trim();
    if (nested) return nested;
  }

  if (typeof part.videoUrl === "string") {
    const camel = part.videoUrl.trim();
    return camel || "";
  }

  if (part.videoUrl && typeof part.videoUrl === "object") {
    const camelNested = String(part.videoUrl.url || "").trim();
    if (camelNested) return camelNested;
  }

  const url = String(part.url || "").trim();
  return url || "";
}

function extractAliyunFileUrl(part) {
  if (!part || typeof part !== "object") return "";

  if (typeof part.file === "string") {
    const directFile = part.file.trim();
    if (directFile) return directFile;
  }

  if (typeof part.file_url === "string") {
    const direct = part.file_url.trim();
    if (direct) return direct;
  }
  if (part.file_url && typeof part.file_url === "object") {
    const nested = String(part.file_url.url || "").trim();
    if (nested) return nested;
  }

  if (typeof part.fileUrl === "string") {
    const directCamel = part.fileUrl.trim();
    if (directCamel) return directCamel;
  }
  if (part.fileUrl && typeof part.fileUrl === "object") {
    const nestedCamel = String(part.fileUrl.url || "").trim();
    if (nestedCamel) return nestedCamel;
  }

  if (part.file && typeof part.file === "object") {
    const fileObjUrl = String(
      part.file.url || part.file.file_url || part.file.fileUrl || "",
    ).trim();
    if (fileObjUrl) return fileObjUrl;
  }

  const url = String(part.url || "").trim();
  return url || "";
}

function normalizeOpenRouterFilePart(part) {
  const file = part?.file && typeof part.file === "object" ? part.file : {};
  const rawFileData =
    file.file_data ?? file.fileData ?? file.url ?? part?.file_data ?? part?.fileData;
  const fileData = String(rawFileData || "").trim();
  if (!fileData) return null;

  const filename = sanitizeText(file.filename || file.name || "", "", 180);
  const payload = {
    file_data: fileData,
  };
  if (filename) {
    payload.filename = filename;
  }
  return payload;
}

function normalizeOpenRouterAudioPart(part) {
  const audio =
    part?.input_audio && typeof part.input_audio === "object"
      ? part.input_audio
      : part?.inputAudio && typeof part.inputAudio === "object"
        ? part.inputAudio
        : {};
  const data = String(audio.data || "").trim();
  const format = String(audio.format || "")
    .trim()
    .toLowerCase();
  if (!data || !format) return null;
  return { data, format };
}

function mapReasoningEffortToResponses(effort) {
  const key = sanitizeReasoningEffort(effort, "high");
  if (key === "none") return "minimal";
  if (key === "low") return "low";
  if (key === "medium") return "medium";
  return "high";
}

function supportsVolcengineResponsesReasoningEffort(model) {
  const defaults = [
    "doubao-seed-2-0-pro-260215",
    "doubao-seed-2-0-pro",
    "doubao-seed-2.0-pro-260215",
    "doubao-seed-2.0-pro",
    "doubao-seed-2-0-lite-260215",
    "doubao-seed-2-0-lite",
    "doubao-seed-2.0-lite-260215",
    "doubao-seed-2.0-lite",
    "doubao-seed-2-0-mini-260215",
    "doubao-seed-2-0-mini",
    "doubao-seed-2.0-mini-260215",
    "doubao-seed-2.0-mini",
    "doubao-seed-1-8-251228",
    "doubao-seed-1-6-lite-251015",
    "doubao-seed-1-6-251015",
  ];

  const fromEnv = String(process.env.VOLCENGINE_RESPONSES_REASONING_MODELS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = fromEnv.length > 0 ? fromEnv : defaults;

  const normalizedModel = String(model || "")
    .trim()
    .toLowerCase();
  if (!normalizedModel) return false;

  return allowlist.some((item) => normalizedModel.includes(item));
}

function resolveRequestProtocol(requestedProtocol, provider, model = "") {
  const protocol = sanitizeRuntimeProtocol(requestedProtocol);

  if (provider === "volcengine") {
    return { supported: true, value: "responses", forced: protocol !== "responses" };
  }

  if (provider === "aliyun") {
    const policy = resolveAliyunModelPolicy(model);
    if (!policy.supported) {
      return {
        supported: false,
        value: "chat",
        forced: false,
        message: policy.errorMessage || "当前阿里云模型不受支持。",
      };
    }
    const normalized = resolveAliyunProtocol(protocol);
    const value = policy.forceProtocol || normalized;
    return { supported: true, value, forced: value !== protocol };
  }

  if (provider === "openrouter") {
    return { supported: true, value: "chat", forced: protocol !== "chat" };
  }

  return { supported: true, value: "chat", forced: protocol !== "chat" };
}

function extractSmartContextIncrementalMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return [messages[i]];
  }
  return [messages[messages.length - 1]];
}

function isPromptLeakProbeRequest(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;

  let lastUserMessage = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUserMessage = messages[i];
      break;
    }
  }
  if (!lastUserMessage) return false;

  const text = extractMessagePlainText(lastUserMessage.content)
    .trim()
    .toLowerCase();
  if (!text) return false;
  const markers = Array.isArray(PROMPT_LEAK_PROBE_KEYWORDS)
    ? PROMPT_LEAK_PROBE_KEYWORDS
    : [];
  return markers.some((marker) =>
    text.includes(
      String(marker || "")
        .trim()
        .toLowerCase(),
    ),
  );
}

function extractMessagePlainText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

async function resolveSmartContextRuntime({
  requested,
  provider,
  protocol,
  model,
  agentId,
  userId,
  sessionId,
  contextMode,
}) {
  const requestedEnabled = sanitizeRuntimeBoolean(requested, false);
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  const safeContextMode = sanitizeSmartContextMode(contextMode);
  const normalizedModel = String(sanitizeRuntimeModel(model) || "")
    .trim()
    .toLowerCase();

  const enabled =
    requestedEnabled &&
    provider === "volcengine" &&
    protocol === "responses" &&
    !!safeUserId &&
    !!safeSessionId;

  const runtime = {
    requested: requestedEnabled,
    enabled,
    userId: safeUserId,
    sessionId: safeSessionId,
    contextMode: safeContextMode,
    usePreviousResponseId: false,
    previousResponseId: "",
    previousModel: "",
    modelChanged: false,
  };

  if (!enabled) return runtime;

  const ref = await readSessionContextRef({ userId: safeUserId, sessionId: safeSessionId });
  if (!ref) return runtime;

  const sameProvider = ref.provider === provider;
  const sameProtocol = ref.protocol === protocol;
  const sameAgent = !ref.agentId || ref.agentId === sanitizeAgent(agentId);
  const canContinue = safeContextMode === "append" && sameProvider && sameProtocol && sameAgent;
  if (!canContinue) return runtime;

  runtime.usePreviousResponseId = true;
  runtime.previousResponseId = ref.previousResponseId;
  runtime.previousModel = ref.model;
  runtime.modelChanged =
    !!ref.model && !!normalizedModel && ref.model !== normalizedModel;
  return runtime;
}

async function readSessionContextRef({ userId, sessionId }) {
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  if (!safeUserId || !safeSessionId) return null;

  const stateDoc = await ChatState.findOne(
    { userId: safeUserId },
    { sessionContextRefs: 1 },
  ).lean();
  const refs =
    stateDoc?.sessionContextRefs && typeof stateDoc.sessionContextRefs === "object"
      ? stateDoc.sessionContextRefs
      : {};
  const raw = refs[safeSessionId];
  if (!raw || typeof raw !== "object") return null;

  const previousResponseId = sanitizeText(raw.previousResponseId, "", 160);
  if (!previousResponseId) return null;

  const provider = String(raw.provider || "")
    .trim()
    .toLowerCase();
  const protocol = String(raw.protocol || "")
    .trim()
    .toLowerCase();
  const model = String(raw.model || "")
    .trim()
    .toLowerCase();
  const agentId = String(raw.agentId || "")
    .trim()
    .toUpperCase();

  return {
    previousResponseId,
    provider,
    protocol,
    model,
    agentId: ["A", "B", "C", "D", AGENT_E_ID].includes(agentId) ? agentId : "",
    updatedAt: sanitizeIsoDate(raw.updatedAt),
  };
}

async function saveSessionContextRef({
  userId,
  sessionId,
  previousResponseId,
  provider,
  protocol,
  model,
  agentId,
}) {
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  const safeResponseId = sanitizeText(previousResponseId, "", 160);
  if (!safeUserId || !safeSessionId || !safeResponseId) return;

  const safeProvider = String(provider || "")
    .trim()
    .toLowerCase()
    .slice(0, 32);
  const safeProtocol = String(protocol || "")
    .trim()
    .toLowerCase()
    .slice(0, 32);
  const safeModel = String(sanitizeRuntimeModel(model) || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const safeAgentId = sanitizeAgent(agentId);

  await ChatState.findOneAndUpdate(
    { userId: safeUserId },
    {
      $set: {
        userId: safeUserId,
        [`sessionContextRefs.${safeSessionId}`]: {
          previousResponseId: safeResponseId,
          provider: safeProvider,
          protocol: safeProtocol,
          model: safeModel,
          agentId: safeAgentId,
          updatedAt: new Date().toISOString(),
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function clearSessionContextRef({ userId, sessionId }) {
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  if (!safeUserId || !safeSessionId) return;

  await ChatState.findOneAndUpdate(
    { userId: safeUserId },
    {
      $set: { userId: safeUserId },
      $unset: { [`sessionContextRefs.${safeSessionId}`]: "" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function shouldResetSmartContextReference(status, detail) {
  if (![400, 404, 410, 422].includes(Number(status))) return false;
  const message = String(detail || "")
    .trim()
    .toLowerCase();
  if (!message) return false;
  return (
    message.includes("previous_response_id") ||
    message.includes("previous response") ||
    message.includes("response id")
  );
}

function pickRecentUserRounds(messages, maxRounds = 10) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const safeRounds = sanitizeRuntimeInteger(maxRounds, 10, 1, RUNTIME_CONTEXT_ROUNDS_MAX);

  let seenUser = 0;
  let startIdx = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      seenUser += 1;
      if (seenUser > safeRounds) {
        startIdx = i + 1;
        break;
      }
    }
  }

  return messages.slice(startIdx);
}

async function parseFileContent(file) {
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = getFileExtension(file.originalname);

  if (isWordFile(ext, mime)) {
    const isDocx = ext === "docx" || mime.includes("wordprocessingml");
    if (!isDocx) {
      return {
        text: "",
        hint: `${GROUP_CHAT_LOCAL_PARSE_HINT_TEXT}；检测到 .doc（旧版 Word），请另存为 .docx 后再上传。`,
      };
    }
    const text = await parseDocx(file.buffer);
    return { text, hint: `Word 文档仅解析文字中的文本（.docx）。` };
  }

  if (isExcelFile(ext, mime)) {
    const text = parseExcel(file.buffer);
    return { text, hint: "Excel 表格仅解析文字中的文本（按工作表展开）。" };
  }

  if (isPdfFile(ext, mime)) {
    const text = await parsePdf(file.buffer);
    return { text, hint: "PDF 文本解析结果。" };
  }

  if (isTextLikeFile(ext, mime, file.buffer)) {
    return {
      text: decodeTextFile(file.buffer),
      hint: "文本/代码文件仅解析文字中的文本。",
    };
  }

  return { text: "", hint: `${GROUP_CHAT_LOCAL_PARSE_HINT_TEXT}。` };
}

function classifyVolcengineFileInputType(file) {
  const mime = String(file?.mimetype || "")
    .trim()
    .toLowerCase();
  const ext = getFileExtension(file?.originalname);

  if (mime.includes("pdf") || ext === "pdf") return "input_file";
  if (mime.startsWith("image/")) return "input_image";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "input_video";
  return "";
}

function normalizeMultipartUploadFile(file) {
  const rawFile = file && typeof file === "object" ? file : null;
  if (!rawFile) return null;
  const normalizedOriginalName = normalizeMultipartFileName(rawFile.originalname);
  if (normalizedOriginalName && normalizedOriginalName !== rawFile.originalname) {
    return { ...rawFile, originalname: normalizedOriginalName };
  }
  return rawFile;
}

async function uploadVolcengineMultipartFilesAsRefs({
  files = [],
  model = "",
  filesEndpoint = "",
  apiKey = "",
  strictSupportedTypes = false,
}) {
  const sourceFiles = Array.isArray(files) ? files : [];
  const uploadedRefs = [];
  const fallbackFiles = [];
  const uploadedFiles = [];

  for (const file of sourceFiles) {
    const normalizedFile = normalizeMultipartUploadFile(file);
    if (!normalizedFile) continue;

    const inputType = classifyVolcengineFileInputType(normalizedFile);
    if (!inputType) {
      if (strictSupportedTypes) {
        throw new Error(
          `文件类型不支持 Files API 上传：${normalizedFile.originalname || "未命名文件"}`,
        );
      }
      fallbackFiles.push(normalizedFile);
      continue;
    }

    const result = await uploadVolcengineFileAndWaitActive({
      file: normalizedFile,
      inputType,
      model,
      filesEndpoint,
      apiKey,
    });
    uploadedRefs.push({
      fileId: result.fileId,
      inputType,
      name: String(normalizedFile.originalname || ""),
      mimeType: String(normalizedFile.mimetype || ""),
      size: Number(normalizedFile.size || 0),
    });
    uploadedFiles.push(normalizedFile);
  }

  return {
    uploadedRefs,
    fallbackFiles,
    uploadedFiles,
  };
}

async function uploadVolcengineFileAndWaitActive({
  file,
  inputType,
  model,
  filesEndpoint,
  apiKey,
}) {
  const safeFileName = String(file?.originalname || "upload.bin");
  const safeMime = String(file?.mimetype || "application/octet-stream");
  const safeBuffer = Buffer.isBuffer(file?.buffer) ? file.buffer : Buffer.from([]);
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", new Blob([safeBuffer], { type: safeMime }), safeFileName);

  if (inputType === "input_video") {
    const rawFps = Number(process.env.VOLCENGINE_FILES_VIDEO_FPS || "0.3");
    const safeFps = Number.isFinite(rawFps)
      ? Math.min(5, Math.max(0.2, rawFps))
      : 0.3;
    form.append("preprocess_configs[video][fps]", String(safeFps));
    const safeModel = sanitizeRuntimeModel(model);
    if (safeModel) {
      form.append("preprocess_configs[video][model]", safeModel);
    }
  }

  let uploadResp;
  try {
    uploadResp = await fetch(filesEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
  } catch (error) {
    throw new Error(`火山 Files API 上传失败: ${error?.message || "network error"}`);
  }

  const uploadDetail = await uploadResp.text();
  if (!uploadResp.ok) {
    throw new Error(
      formatProviderUpstreamError("volcengine", "files", uploadResp.status, uploadDetail),
    );
  }

  let uploadJson = {};
  try {
    uploadJson = JSON.parse(uploadDetail || "{}");
  } catch {
    uploadJson = {};
  }

  const fileId = sanitizeText(uploadJson?.id, "", 160);
  if (!fileId) {
    throw new Error("火山 Files API 返回异常：缺少 file_id。");
  }

  return waitForVolcengineFileActive({
    fileId,
    filesEndpoint,
    apiKey,
  });
}

async function waitForVolcengineFileActive({ fileId, filesEndpoint, apiKey }) {
  const timeoutMs = 5 * 60 * 1000;
  const pollMs = 1500;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "processing";

  while (Date.now() < deadline) {
    const meta = await retrieveVolcengineFileMeta({ fileId, filesEndpoint, apiKey });
    const status = String(meta?.status || "")
      .trim()
      .toLowerCase();
    if (status) {
      lastStatus = status;
    }
    if (status === "active") {
      return { fileId };
    }
    if (status === "failed") {
      const errorMessage =
        sanitizeText(meta?.error?.message, "", 600) || "文件预处理失败";
      throw new Error(`文件处理失败（${fileId}）：${errorMessage}`);
    }
    await sleepMs(pollMs);
  }

  throw new Error(`文件处理超时（${fileId}），当前状态：${lastStatus}`);
}

async function retrieveVolcengineFileMeta({ fileId, filesEndpoint, apiKey }) {
  const url = `${filesEndpoint}/${encodeURIComponent(fileId)}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    throw new Error(`查询文件状态失败（${fileId}）：${error?.message || "network error"}`);
  }

  const detail = await resp.text();
  if (!resp.ok) {
    throw new Error(formatProviderUpstreamError("volcengine", "files", resp.status, detail));
  }

  try {
    return JSON.parse(detail || "{}");
  } catch {
    return {};
  }
}

async function sleepMs(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getFileExtension(filename) {
  const raw = path.extname(String(filename || "")).toLowerCase();
  return raw.startsWith(".") ? raw.slice(1) : raw;
}

function normalizeMultipartFileName(filename) {
  const raw = String(filename || "").trim();
  if (!raw) return "";

  try {
    const repaired = Buffer.from(raw, "latin1").toString("utf8");
    if (!repaired || repaired.includes("\u0000")) return raw;
    const roundtrip = Buffer.from(repaired, "utf8").toString("latin1");
    if (roundtrip === raw) {
      return repaired;
    }
  } catch {
    return raw;
  }

  return raw;
}

function isWordFile(ext, mime) {
  if (WORD_EXTENSIONS.has(ext)) return true;
  return mime.includes("wordprocessingml") || mime.includes("msword");
}

function isExcelFile(ext, mime) {
  if (EXCEL_EXTENSIONS.has(ext)) return true;
  return (
    mime.includes("spreadsheetml") ||
    mime.includes("excel") ||
    mime.includes("sheet")
  );
}

function isPdfFile(ext, mime) {
  return PDF_EXTENSIONS.has(ext) || mime.includes("pdf");
}

function isTextLikeFile(ext, mime, buffer) {
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("markdown") ||
    mime.includes("x-python") ||
    mime.includes("x-c")
  ) {
    return !isProbablyBinary(buffer);
  }
  return false;
}

function isProbablyBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sampleSize = Math.min(buffer.length, 2048);
  let suspicious = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    const byte = buffer[i];
    if (byte === 0) suspicious += 3;
    else if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9)
      suspicious += 1;
  }

  return suspicious / sampleSize > 0.12;
}

function decodeTextFile(buffer) {
  return String(buffer.toString("utf8") || "").replace(/\u0000/g, "");
}

async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return String(result?.value || "");
}

function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  const sections = [];

  for (const name of sheetNames.slice(0, EXCEL_PREVIEW_MAX_SHEETS)) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const body = rows
      .slice(0, EXCEL_PREVIEW_MAX_ROWS)
      .map((row) => normalizeRow(row))
      .join("\n");

    const rowOverflow = rows.length > EXCEL_PREVIEW_MAX_ROWS;
    const sectionLines = [`[工作表: ${name}]`, body || "(空工作表)"];
    if (rowOverflow) {
      sectionLines.push(
        `... 其余 ${rows.length - EXCEL_PREVIEW_MAX_ROWS} 行已省略`,
      );
    }
    sections.push(sectionLines.join("\n"));
  }

  if (sheetNames.length > EXCEL_PREVIEW_MAX_SHEETS) {
    sections.push(
      `... 其余 ${sheetNames.length - EXCEL_PREVIEW_MAX_SHEETS} 个工作表已省略`,
    );
  }

  return sections.join("\n\n");
}

function normalizeRow(row) {
  if (!Array.isArray(row)) return String(row ?? "");
  const sliced = row.slice(0, EXCEL_PREVIEW_MAX_COLS).map((cell) =>
    String(cell ?? "")
      .replace(/\r?\n/g, " ")
      .trim(),
  );
  let line = sliced.join("\t");
  if (row.length > EXCEL_PREVIEW_MAX_COLS) {
    line = `${line}\t...`;
  }
  return line;
}

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return String(result?.text || "");
  } finally {
    await parser.destroy();
  }
}

function clipText(text, maxChars = MAX_PARSED_CHARS_PER_FILE) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const numeric = Number(maxChars);
  const safeMax = Number.isFinite(numeric)
    ? Math.max(200, Math.min(500000, Math.round(numeric)))
    : MAX_PARSED_CHARS_PER_FILE;
  if (normalized.length <= safeMax) return normalized;
  const clipped = normalized.slice(0, safeMax);
  return `${clipped}\n...（内容过长，已截断）`;
}

async function pipeOpenRouterSse(upstream, res, reasoningEnabled) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawContent = false;
  let sawReasoning = false;

  const processSseBlock = (block) => {
    const data = extractSseDataPayload(block);
    if (!data) return false;
    if (data === "[DONE]") return true;

    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return false;
    }

    const streamError = extractOpenRouterStreamErrorMessage(json);
    if (streamError) {
      throw new Error(streamError);
    }

    const choice = json?.choices?.[0] || {};
    const delta = choice?.delta && typeof choice.delta === "object" ? choice.delta : {};

    const contentDeltaText =
      extractDeltaText(delta.content) ||
      extractDeltaText(delta.text) ||
      extractDeltaText(delta.output_text);
    const contentFallbackText = sawContent
      ? ""
      : extractDeltaText(choice?.message?.content) ||
        extractDeltaText(choice?.text) ||
        extractDeltaText(json?.output_text);
    const contentText = contentDeltaText || contentFallbackText;

    const reasoningDeltaText =
      extractDeltaText(delta.reasoning) ||
      extractDeltaText(delta.reasoning_content) ||
      extractDeltaText(delta.thinking);
    const reasoningFallbackText = sawReasoning
      ? ""
      : extractDeltaText(choice?.message?.reasoning) ||
        extractDeltaText(choice?.message?.reasoning_content);
    const reasoningText = reasoningDeltaText || reasoningFallbackText;

    if (contentText) {
      sawContent = true;
      writeEvent(res, "token", { text: contentText });
    }

    if (reasoningEnabled && reasoningText) {
      sawReasoning = true;
      writeEvent(res, "reasoning_token", { text: reasoningText });
    }
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = findSseEventBoundary(buffer);
    while (boundary.index !== -1) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.separatorLength);
      const gotDone = processSseBlock(block);
      if (gotDone) return;
      boundary = findSseEventBoundary(buffer);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    processSseBlock(tail);
  }

  if (!sawContent && sawReasoning) {
    throw new Error("上游仅返回了思路内容，未返回最终回答。");
  }
  if (!sawContent) {
    throw new Error("上游未返回有效回答内容。");
  }
}

async function pipeResponsesSse(
  upstream,
  res,
  reasoningEnabled,
  { emitSearchUsage = false } = {},
) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawContent = false;
  let sawReasoning = false;
  let responseId = "";

  const processSseBlock = (block) => {
    const data = extractSseDataPayload(block);
    if (!data) return false;
    if (data === "[DONE]") return true;

    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return false;
    }

    const type = String(json?.type || "")
      .trim()
      .toLowerCase();
    if (!responseId) {
      responseId = sanitizeText(json?.response?.id || json?.response_id, "", 160);
    }
    const deltaText = extractDeltaText(json?.delta);
    const doneText = extractDeltaText(json?.text);

    if (type === "error" || type === "response.failed") {
      throw new Error(extractResponsesErrorMessage(json));
    }

    if (
      type === "response.output_text.delta" ||
      type === "response.text.delta" ||
      type === "response.output_text_part.delta"
    ) {
      if (deltaText) {
        sawContent = true;
        writeEvent(res, "token", { text: deltaText });
      }
      return false;
    }

    if (
      type === "response.output_text.done" ||
      type === "response.text.done" ||
      type === "response.output_text_part.done"
    ) {
      if (!sawContent && doneText) {
        sawContent = true;
        writeEvent(res, "token", { text: doneText });
      }
      return false;
    }

    if (
      type === "response.reasoning_summary_text.delta" ||
      type === "response.reasoning_text.delta"
    ) {
      if (reasoningEnabled && deltaText) {
        sawReasoning = true;
        writeEvent(res, "reasoning_token", { text: deltaText });
      }
      return false;
    }

    if (
      type === "response.reasoning_summary_text.done" ||
      type === "response.reasoning_text.done"
    ) {
      if (reasoningEnabled && !sawReasoning && doneText) {
        sawReasoning = true;
        writeEvent(res, "reasoning_token", { text: doneText });
      }
      return false;
    }

    if (type === "response.created" || type === "response.in_progress") {
      return false;
    }

    if (type === "response.completed") {
      responseId = sanitizeText(json?.response?.id || responseId, responseId, 160);
      writeEvent(res, "usage", {
        usage: extractResponsesTokenUsage(json?.response),
      });
      if (!sawContent) {
        const completedText = extractResponsesOutputTextFromCompleted(json?.response);
        if (completedText) {
          sawContent = true;
          writeEvent(res, "token", { text: completedText });
        }
      }
      if (reasoningEnabled && !sawReasoning) {
        const completedReasoning = extractResponsesReasoningTextFromCompleted(
          json?.response,
        );
        if (completedReasoning) {
          sawReasoning = true;
          writeEvent(res, "reasoning_token", { text: completedReasoning });
        }
      }
      if (emitSearchUsage) {
        writeEvent(res, "search_usage", extractResponsesWebSearchUsage(json?.response));
      }
      return true;
    }

    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = findSseEventBoundary(buffer);
    while (boundary.index !== -1) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.separatorLength);
      const gotDone = processSseBlock(block);
      if (gotDone) return { responseId };
      boundary = findSseEventBoundary(buffer);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    processSseBlock(tail);
  }

  if (!sawContent && sawReasoning) {
    throw new Error("上游仅返回了思路内容，未返回最终回答。");
  }
  if (!sawContent) {
    throw new Error("上游未返回有效回答内容。");
  }
  return { responseId };
}

function extractResponsesOutputTextFromCompleted(responseObj) {
  const output = Array.isArray(responseObj?.output) ? responseObj.output : [];
  const chunks = [];

  output.forEach((item) => {
    if (!item || item.type !== "message") return;
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (!part || (part.type !== "output_text" && part.type !== "text")) return;
      const text = extractDeltaText(part.text || part.content || "");
      if (text) chunks.push(text);
    });
  });

  return chunks.join("");
}

function extractResponsesReasoningTextFromCompleted(responseObj) {
  const output = Array.isArray(responseObj?.output) ? responseObj.output : [];
  const chunks = [];

  output.forEach((item) => {
    if (!item || item.type !== "reasoning") return;
    const summary = Array.isArray(item.summary) ? item.summary : [];
    summary.forEach((part) => {
      if (!part || (part.type !== "summary_text" && part.type !== "text")) return;
      const text = extractDeltaText(part.text || part.content || "");
      if (text) chunks.push(text);
    });
  });

  return chunks.join("");
}

function extractResponsesTokenUsage(responseObj) {
  const usage =
    responseObj?.usage && typeof responseObj.usage === "object"
      ? responseObj.usage
      : {};
  const promptTokens = sanitizeRuntimeInteger(
    usage.input_tokens ?? usage.prompt_tokens,
    0,
    0,
    10_000_000,
  );
  const completionTokens = sanitizeRuntimeInteger(
    usage.output_tokens ?? usage.completion_tokens,
    0,
    0,
    10_000_000,
  );
  const totalTokens = sanitizeRuntimeInteger(
    usage.total_tokens,
    promptTokens + completionTokens,
    0,
    10_000_000,
  );
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function extractResponsesWebSearchUsage(responseObj) {
  const usage =
    responseObj?.usage && typeof responseObj.usage === "object"
      ? responseObj.usage
      : {};
  const webSearchCalls = Math.max(
    extractNamedToolUsageCount(usage.tool_usage, "web_search"),
    extractNamedToolUsageCount(usage.x_tools, "web_search"),
  );
  const details = {
    ...extractNamedToolUsageDetails(usage.tool_usage_details, "web_search"),
    ...extractNamedToolUsageDetails(usage.x_tools, "web_search"),
  };

  return {
    webSearchCalls,
    details,
    text: formatWebSearchUsageText(webSearchCalls, details),
  };
}

function extractNamedToolUsageCount(source, toolName) {
  const direct = normalizeUsageCount(source);
  if (direct !== null) return direct;

  if (source && typeof source === "object" && !Array.isArray(source)) {
    const selected = source[toolName];
    const selectedCount = normalizeUsageCount(selected);
    if (selectedCount !== null) return selectedCount;
    if (selected && typeof selected === "object") {
      const summed = sumNumericUsage(selected);
      if (summed !== null) return summed;
    }
  }

  if (typeof source === "string") {
    const regex = new RegExp(`${toolName}\\s*[:=]\\s*(\\d+)`, "i");
    const match = source.match(regex);
    if (match?.[1]) {
      return sanitizeUsageCountNumber(Number(match[1]));
    }
  }

  return 0;
}

function extractNamedToolUsageDetails(source, toolName) {
  const details = {};
  if (!source) return details;

  let selected = source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    selected = source[toolName];
    if (!selected && source.web_search) {
      selected = source.web_search;
    }
  }

  if (selected && typeof selected === "object" && !Array.isArray(selected)) {
    Object.entries(selected).forEach(([name, count]) => {
      const normalized = normalizeUsageCount(count);
      if (normalized === null) return;
      details[name] = normalized;
    });
    return details;
  }

  if (typeof selected === "string") {
    try {
      const parsed = JSON.parse(selected);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([name, count]) => {
          const normalized = normalizeUsageCount(count);
          if (normalized === null) return;
          details[name] = normalized;
        });
      }
    } catch {
      // ignore
    }
  }

  return details;
}

function normalizeUsageCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return sanitizeUsageCountNumber(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return sanitizeUsageCountNumber(parsed);
    }
  }

  return null;
}

function sumNumericUsage(obj) {
  if (!obj || typeof obj !== "object") return null;
  let saw = false;
  let total = 0;
  Object.values(obj).forEach((value) => {
    const count = normalizeUsageCount(value);
    if (count === null) return;
    saw = true;
    total += count;
  });
  return saw ? total : null;
}

function sanitizeUsageCountNumber(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function formatWebSearchUsageText(total, details) {
  const safeTotal = sanitizeUsageCountNumber(total);
  const entries = Object.entries(details || {})
    .filter(([, count]) => Number.isFinite(count))
    .map(([name, count]) => `${name}=${sanitizeUsageCountNumber(count)}`);

  if (safeTotal <= 0 && entries.length === 0) {
    return "联网搜索用量：web_search=0（本轮未触发搜索）";
  }

  if (entries.length === 0) {
    return `联网搜索用量：web_search=${safeTotal}`;
  }

  return `联网搜索用量：web_search=${safeTotal}；明细：${entries.join("，")}`;
}

function extractResponsesErrorMessage(event) {
  const explicit = String(event?.error?.message || event?.message || "").trim();
  if (explicit) return explicit;
  return "Responses API 调用失败";
}

function extractOpenRouterStreamErrorMessage(payload) {
  if (!payload || typeof payload !== "object") return "";

  const type = String(payload?.type || "")
    .trim()
    .toLowerCase();
  const errorValue = payload?.error;
  const hasErrorField =
    typeof errorValue === "string" || (errorValue && typeof errorValue === "object");
  const typeLooksError = type === "error" || type === "response.failed";
  if (!hasErrorField && !typeLooksError) return "";

  const nestedMessage =
    typeof errorValue === "string" ? errorValue : sanitizeText(errorValue?.message, "", 800);
  const topMessage = sanitizeText(payload?.message, "", 800);
  const message = nestedMessage || topMessage || "OpenRouter 流式调用失败";
  const code = sanitizeText(
    (typeof errorValue === "object" ? errorValue?.code : "") || payload?.code,
    "",
    120,
  );
  if (!code) return message;
  return `${message} (${code})`;
}

function extractDeltaText(part) {
  if (!part) return "";
  if (typeof part === "string") return part;

  if (Array.isArray(part)) {
    return part
      .map((p) => {
        if (!p) return "";
        if (typeof p === "string") return p;
        return p.text || p.content || "";
      })
      .join("");
  }

  if (typeof part === "object") {
    return part.text || part.content || "";
  }

  return "";
}

function extractSseDataPayload(block) {
  if (!block) return "";
  const normalized = String(block).replace(/\r/g, "");
  const lines = normalized.split("\n");
  const dataLines = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0) return "";
  return dataLines.join("\n").trim();
}

function findSseEventBoundary(buffer) {
  if (!buffer) return { index: -1, separatorLength: 0 };

  const lfBoundary = buffer.indexOf("\n\n");
  const crlfBoundary = buffer.indexOf("\r\n\r\n");

  if (lfBoundary === -1 && crlfBoundary === -1) {
    return { index: -1, separatorLength: 0 };
  }
  if (lfBoundary === -1) {
    return { index: crlfBoundary, separatorLength: 4 };
  }
  if (crlfBoundary === -1) {
    return { index: lfBoundary, separatorLength: 2 };
  }
  if (crlfBoundary < lfBoundary) {
    return { index: crlfBoundary, separatorLength: 4 };
  }
  return { index: lfBoundary, separatorLength: 2 };
}

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function safeReadJson(response) {
  const text = await safeReadText(response);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getModelByAgent(agentId, runtimeConfig = null) {
  const runtimeModel = sanitizeRuntimeModel(runtimeConfig?.model);
  if (runtimeModel) return runtimeModel;

  const defaults = {
    A: "doubao-seed-1-6-251015",
    B: "glm-4-7-251222",
    C: "deepseek-v3-2-251201",
    D: AGENT_D_FIXED_MODEL,
  };

  const targetAgent = sanitizeAgent(agentId);
  const map = {
    A: process.env.AGENT_MODEL_A || defaults.A,
    B: process.env.AGENT_MODEL_B || defaults.B,
    C: process.env.AGENT_MODEL_C || defaults.C,
    D: defaults.D,
  };

  return sanitizeRuntimeModel(map[targetAgent] || map.A) || map.A;
}

async function getSystemPromptByAgent(agentId) {
  const fallback = getDefaultSystemPrompt();
  try {
    const config = await readAdminAgentConfig();
    const targetAgent = sanitizeAgent(agentId);
    const prompt = config.prompts[targetAgent] || "";
    return prompt || fallback;
  } catch (error) {
    console.error("Failed to load admin agent prompts:", error);
    return fallback;
  }
}

async function getResolvedAgentRuntimeConfig(agentId) {
  const targetAgent = sanitizeAgent(agentId);
  if (targetAgent === AGENT_E_ID) {
    try {
      const agentEConfig = await readAgentEConfig();
      return sanitizeAgentERuntime(agentEConfig?.runtime, agentEConfig?.runtime);
    } catch (error) {
      console.error("Failed to load agent E runtime config:", error);
      return sanitizeAgentERuntime();
    }
  }
  try {
    const config = await readAdminAgentConfig();
    const resolved = resolveAgentRuntimeConfigs(config.runtimeConfigs);
    return resolved[targetAgent] || normalizeRuntimeConfigFromPreset({}, targetAgent);
  } catch (error) {
    console.error("Failed to load admin runtime configs:", error);
    return normalizeRuntimeConfigFromPreset({}, targetAgent);
  }
}

function getDefaultSystemPrompt() {
  const prompt = String(
    process.env.DEFAULT_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT_FALLBACK,
  ).trim();
  return prompt || DEFAULT_SYSTEM_PROMPT_FALLBACK;
}

async function readAdminAgentConfig() {
  const doc = await AdminConfig.findOne({ key: ADMIN_CONFIG_KEY }).lean();
  return normalizeAdminConfigDoc(doc);
}

async function readAgentEConfig() {
  const doc = await AgentEConfig.findOne({ key: AGENT_E_CONFIG_KEY }).lean();
  return normalizeAgentEConfigDoc(doc);
}

async function writeAgentEConfig(raw) {
  const previous = await readAgentEConfig();
  const normalized = sanitizeAgentEConfigPayload(raw, previous);
  const { updatedAt: _ignore, ...payload } = normalized;
  const doc = await AgentEConfig.findOneAndUpdate(
    { key: AGENT_E_CONFIG_KEY },
    {
      $set: {
        ...payload,
        key: AGENT_E_CONFIG_KEY,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();
  return normalizeAgentEConfigDoc(doc);
}

function normalizeAdminConfigDoc(doc) {
  return {
    prompts: sanitizeAgentPromptPayload(doc?.agentSystemPrompts),
    runtimeConfigs: sanitizeAgentRuntimeConfigsPayload(doc?.agentRuntimeConfigs),
    updatedAt: sanitizeIsoDate(doc?.updatedAt),
  };
}

function sanitizeAgentPromptPayload(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    A: sanitizeSystemPrompt(source.A),
    B: sanitizeSystemPrompt(source.B),
    C: sanitizeSystemPrompt(source.C),
    D: sanitizeSystemPrompt(source.D),
  };
}

function resolveAgentSystemPrompts(prompts) {
  const defaultPrompt = getDefaultSystemPrompt();
  const normalized = sanitizeAgentPromptPayload(prompts);
  const resolved = {};
  AGENT_IDS.forEach((agentId) => {
    resolved[agentId] = normalized[agentId] || defaultPrompt;
  });
  return resolved;
}

function sanitizeAgentRuntimeConfigsPayload(input) {
  const source = input && typeof input === "object" ? input : {};
  const next = {};
  AGENT_IDS.forEach((agentId) => {
    next[agentId] = sanitizeSingleAgentRuntimeConfig(source[agentId], agentId);
  });
  return next;
}

function sanitizeSingleAgentRuntimeConfig(raw, agentId = "A") {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalizedAgentId = sanitizeAgent(agentId);
  const defaults = getDefaultRuntimeConfigByAgent(normalizedAgentId);
  const provider = sanitizeRuntimeProvider(source.provider);
  const protocol = sanitizeRuntimeProtocol(source.protocol);
  const model = sanitizeRuntimeModel(source.model);
  const modelForMatching =
    model || getModelByAgent(normalizedAgentId, { model: "" });
  const tokenProfile = resolveRuntimeTokenProfileByModel(modelForMatching);
  const tokenDefaults = tokenProfile || defaults;
  const lockTokenFields = protocol === "responses" && provider === "volcengine";
  const lockAliyunMaxOutput = provider === "aliyun";
  const creativityMode = sanitizeCreativityMode(source.creativityMode);
  const temperature = sanitizeRuntimeNumber(
    source.temperature,
    defaults.temperature,
    0,
    2,
  );
  const topP = sanitizeRuntimeNumber(
    source.topP,
    defaults.topP,
    0,
    1,
  );
  const frequencyPenalty = sanitizeRuntimeNumber(
    source.frequencyPenalty,
    defaults.frequencyPenalty,
    -2,
    2,
  );
  const presencePenalty = sanitizeRuntimeNumber(
    source.presencePenalty,
    defaults.presencePenalty,
    -2,
    2,
  );
  const contextRounds = sanitizeRuntimeInteger(
    source.contextRounds,
    defaults.contextRounds,
    1,
    RUNTIME_CONTEXT_ROUNDS_MAX,
  );
  const contextWindowTokens = sanitizeRuntimeInteger(
    lockTokenFields ? tokenDefaults.contextWindowTokens : source.contextWindowTokens,
    tokenDefaults.contextWindowTokens,
    1024,
    RUNTIME_MAX_CONTEXT_WINDOW_TOKENS,
  );
  const maxInputTokens = sanitizeRuntimeInteger(
    lockTokenFields ? tokenDefaults.maxInputTokens : source.maxInputTokens,
    tokenDefaults.maxInputTokens,
    1024,
    RUNTIME_MAX_INPUT_TOKENS,
  );
  const maxOutputTokens = sanitizeRuntimeInteger(
    lockAliyunMaxOutput ? tokenDefaults.maxOutputTokens : source.maxOutputTokens,
    tokenDefaults.maxOutputTokens,
    64,
    RUNTIME_MAX_OUTPUT_TOKENS,
  );
  const maxReasoningTokens = sanitizeRuntimeInteger(
    lockTokenFields ? tokenDefaults.maxReasoningTokens : source.maxReasoningTokens,
    tokenDefaults.maxReasoningTokens,
    0,
    RUNTIME_MAX_REASONING_TOKENS,
  );
  const enableThinking = sanitizeRuntimeBoolean(
    source.enableThinking,
    defaults.enableThinking,
  );
  const thinkingEffort = sanitizeReasoningEffort(
    source.thinkingEffort,
    defaults.thinkingEffort,
  );
  const includeCurrentTime = sanitizeRuntimeBoolean(
    source.includeCurrentTime,
    defaults.includeCurrentTime,
  );
  const preventPromptLeak = sanitizeRuntimeBoolean(
    source.preventPromptLeak,
    defaults.preventPromptLeak,
  );
  const injectSafetyPrompt = sanitizeRuntimeBoolean(
    source.injectSafetyPrompt,
    defaults.injectSafetyPrompt,
  );
  const enableWebSearch = sanitizeRuntimeBoolean(
    source.enableWebSearch,
    defaults.enableWebSearch,
  );
  const webSearchMaxKeyword = sanitizeRuntimeInteger(
    source.webSearchMaxKeyword,
    defaults.webSearchMaxKeyword,
    1,
    50,
  );
  const webSearchResultLimit = sanitizeRuntimeInteger(
    source.webSearchResultLimit,
    defaults.webSearchResultLimit,
    1,
    50,
  );
  const webSearchMaxToolCalls = sanitizeRuntimeInteger(
    source.webSearchMaxToolCalls,
    defaults.webSearchMaxToolCalls,
    1,
    10,
  );
  const webSearchSourceDouyin = sanitizeRuntimeBoolean(
    source.webSearchSourceDouyin,
    defaults.webSearchSourceDouyin,
  );
  const webSearchSourceMoji = sanitizeRuntimeBoolean(
    source.webSearchSourceMoji,
    defaults.webSearchSourceMoji,
  );
  const webSearchSourceToutiao = sanitizeRuntimeBoolean(
    source.webSearchSourceToutiao,
    defaults.webSearchSourceToutiao,
  );
  const aliyunThinkingBudget =
    provider === "aliyun"
      ? 0
      : sanitizeRuntimeInteger(
          source.aliyunThinkingBudget,
          defaults.aliyunThinkingBudget,
          0,
          RUNTIME_MAX_REASONING_TOKENS,
        );
  const aliyunSearchForced = sanitizeRuntimeBoolean(
    source.aliyunSearchForced,
    defaults.aliyunSearchForced,
  );
  const aliyunSearchStrategy = sanitizeAliyunSearchStrategy(
    source.aliyunSearchStrategy,
  );
  const aliyunSearchEnableSource = sanitizeRuntimeBoolean(
    source.aliyunSearchEnableSource,
    defaults.aliyunSearchEnableSource,
  );
  const aliyunSearchEnableCitation = sanitizeRuntimeBoolean(
    source.aliyunSearchEnableCitation,
    defaults.aliyunSearchEnableCitation,
  );
  const aliyunSearchCitationFormat = sanitizeAliyunSearchCitationFormat(
    source.aliyunSearchCitationFormat,
  );
  const aliyunSearchEnableSearchExtension = sanitizeRuntimeBoolean(
    source.aliyunSearchEnableSearchExtension,
    defaults.aliyunSearchEnableSearchExtension,
  );
  const aliyunSearchPrependSearchResult = sanitizeRuntimeBoolean(
    source.aliyunSearchPrependSearchResult,
    defaults.aliyunSearchPrependSearchResult,
  );
  const aliyunSearchFreshness = sanitizeAliyunSearchFreshness(
    source.aliyunSearchFreshness,
  );
  const aliyunSearchAssignedSiteList = sanitizeAliyunAssignedSiteList(
    source.aliyunSearchAssignedSiteList,
    defaults.aliyunSearchAssignedSiteList,
  );
  const aliyunSearchPromptIntervene = sanitizeAliyunPromptIntervene(
    source.aliyunSearchPromptIntervene,
  );
  const aliyunResponsesEnableWebExtractor = sanitizeRuntimeBoolean(
    source.aliyunResponsesEnableWebExtractor,
    defaults.aliyunResponsesEnableWebExtractor,
  );
  const aliyunResponsesEnableCodeInterpreter = sanitizeRuntimeBoolean(
    source.aliyunResponsesEnableCodeInterpreter,
    defaults.aliyunResponsesEnableCodeInterpreter,
  );
  const aliyunFileProcessMode = sanitizeAliyunFileProcessMode(
    source.aliyunFileProcessMode,
  );
  const openrouterPreset = sanitizeOpenRouterPreset(source.openrouterPreset);
  const openrouterIncludeReasoning = sanitizeRuntimeBoolean(
    source.openrouterIncludeReasoning,
    defaults.openrouterIncludeReasoning,
  );
  const openrouterUseWebPlugin = sanitizeRuntimeBoolean(
    source.openrouterUseWebPlugin,
    defaults.openrouterUseWebPlugin,
  );
  const openrouterWebPluginEngine = sanitizeOpenRouterWebPluginEngine(
    source.openrouterWebPluginEngine,
  );
  const openrouterWebPluginMaxResults = sanitizeRuntimeInteger(
    source.openrouterWebPluginMaxResults,
    defaults.openrouterWebPluginMaxResults,
    1,
    10,
  );
  const openrouterUseResponseHealing = sanitizeRuntimeBoolean(
    source.openrouterUseResponseHealing,
    defaults.openrouterUseResponseHealing,
  );
  const openrouterPdfEngine = sanitizeOpenRouterPdfEngine(source.openrouterPdfEngine);

  const next = {
    provider,
    model,
    protocol,
    creativityMode,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    contextRounds,
    contextWindowTokens,
    maxInputTokens,
    maxOutputTokens,
    maxReasoningTokens,
    enableThinking,
    thinkingEffort,
    includeCurrentTime,
    preventPromptLeak,
    injectSafetyPrompt,
    enableWebSearch,
    webSearchMaxKeyword,
    webSearchResultLimit,
    webSearchMaxToolCalls,
    webSearchSourceDouyin,
    webSearchSourceMoji,
    webSearchSourceToutiao,
    aliyunThinkingBudget,
    aliyunSearchForced,
    aliyunSearchStrategy,
    aliyunSearchEnableSource,
    aliyunSearchEnableCitation,
    aliyunSearchCitationFormat,
    aliyunSearchEnableSearchExtension,
    aliyunSearchPrependSearchResult,
    aliyunSearchFreshness,
    aliyunSearchAssignedSiteList,
    aliyunSearchPromptIntervene,
    aliyunResponsesEnableWebExtractor,
    aliyunResponsesEnableCodeInterpreter,
    aliyunFileProcessMode,
    openrouterPreset,
    openrouterIncludeReasoning,
    openrouterUseWebPlugin,
    openrouterWebPluginEngine,
    openrouterWebPluginMaxResults,
    openrouterUseResponseHealing,
    openrouterPdfEngine,
  };

  if (isVolcengineFixedSamplingModel(modelForMatching)) {
    next.temperature = VOLCENGINE_FIXED_TEMPERATURE;
    next.topP = VOLCENGINE_FIXED_TOP_P;
  }

  if (provider === "aliyun") {
    const policy = resolveAliyunModelPolicy(modelForMatching);
    if (policy.forceProtocol) {
      next.protocol = policy.forceProtocol;
    }
    if (policy.fixedSampling) {
      next.temperature = sanitizeRuntimeNumber(
        policy.fixedSampling.temperature,
        next.temperature,
        0,
        2,
      );
      next.topP = sanitizeRuntimeNumber(policy.fixedSampling.topP, next.topP, 0, 1);
    }
    if (!policy.allowWebSearch) {
      next.enableWebSearch = false;
      next.aliyunSearchForced = false;
      next.aliyunSearchEnableSource = false;
      next.aliyunSearchEnableCitation = false;
      next.aliyunSearchEnableSearchExtension = false;
      next.aliyunSearchPrependSearchResult = false;
      next.aliyunResponsesEnableWebExtractor = false;
      next.aliyunResponsesEnableCodeInterpreter = false;
    }
  }

  if (normalizedAgentId === "D") {
    const sourceProvider = sanitizeRuntimeProvider(source.provider);
    const sourceModel = sanitizeRuntimeModel(source.model).toLowerCase();
    const shouldApplyBootDefaults =
      sourceProvider !== AGENT_D_FIXED_PROVIDER || sourceModel !== AGENT_D_FIXED_MODEL;

    next.provider = AGENT_D_FIXED_PROVIDER;
    next.model = AGENT_D_FIXED_MODEL;
    next.includeCurrentTime = true;
    next.maxOutputTokens = AGENT_D_FIXED_MAX_OUTPUT_TOKENS;

    if (shouldApplyBootDefaults) {
      next.protocol = "responses";
    }
  }

  return next;
}

function resolveAgentRuntimeConfigs(runtimeConfigs) {
  const normalized = sanitizeAgentRuntimeConfigsPayload(runtimeConfigs);
  const resolved = {};
  AGENT_IDS.forEach((agentId) => {
    resolved[agentId] = normalizeRuntimeConfigFromPreset(normalized[agentId], agentId);
  });
  return resolved;
}

function normalizeRuntimeConfigFromPreset(runtimeConfig, agentId = "A") {
  const config = sanitizeSingleAgentRuntimeConfig(runtimeConfig, agentId);
  const base = getRuntimePresetDefaults(config.creativityMode);
  const next = {
    ...config,
    temperature:
      config.creativityMode === "custom"
        ? config.temperature
        : sanitizeRuntimeNumber(base.temperature, config.temperature, 0, 2),
    topP:
      config.creativityMode === "custom"
        ? config.topP
        : sanitizeRuntimeNumber(base.topP, config.topP, 0, 1),
    frequencyPenalty:
      config.creativityMode === "custom"
        ? config.frequencyPenalty
        : sanitizeRuntimeNumber(base.frequencyPenalty, config.frequencyPenalty, -2, 2),
    presencePenalty:
      config.creativityMode === "custom"
        ? config.presencePenalty
        : sanitizeRuntimeNumber(base.presencePenalty, config.presencePenalty, -2, 2),
  };

  const normalizedAgentId = sanitizeAgent(agentId);
  const modelForMatching =
    sanitizeRuntimeModel(config.model) ||
    getModelByAgent(normalizedAgentId, { model: "" });
  if (isVolcengineFixedSamplingModel(modelForMatching)) {
    next.temperature = VOLCENGINE_FIXED_TEMPERATURE;
    next.topP = VOLCENGINE_FIXED_TOP_P;
  }

  if (config.provider === "aliyun") {
    const policy = resolveAliyunModelPolicy(modelForMatching);
    if (policy.forceProtocol) {
      next.protocol = policy.forceProtocol;
    }
    if (policy.fixedSampling) {
      next.temperature = sanitizeRuntimeNumber(
        policy.fixedSampling.temperature,
        next.temperature,
        0,
        2,
      );
      next.topP = sanitizeRuntimeNumber(policy.fixedSampling.topP, next.topP, 0, 1);
    }
    if (!policy.allowWebSearch) {
      next.enableWebSearch = false;
      next.aliyunSearchForced = false;
      next.aliyunSearchEnableSource = false;
      next.aliyunSearchEnableCitation = false;
      next.aliyunSearchEnableSearchExtension = false;
      next.aliyunSearchPrependSearchResult = false;
      next.aliyunResponsesEnableWebExtractor = false;
      next.aliyunResponsesEnableCodeInterpreter = false;
    }
  }

  return next;
}

function getRuntimePresetDefaults(mode) {
  if (mode === "precise") {
    return { temperature: 0.2, topP: 0.8, frequencyPenalty: 0, presencePenalty: -0.1 };
  }
  if (mode === "creative") {
    return { temperature: 1.1, topP: 1, frequencyPenalty: 0.2, presencePenalty: 0.3 };
  }
  return { temperature: 0.6, topP: 1, frequencyPenalty: 0, presencePenalty: 0 };
}

function sanitizeRuntimeProtocol(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "responses" || key === "response") return "responses";
  if (key === "dashscope" || key === "native") return "dashscope";
  return "chat";
}

function sanitizeRuntimeProvider(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
  if (key === "inherit" || key === "default" || key === "auto") return "inherit";
  if (key === "openrouter") return "openrouter";
  if (key === "aliyun" || key === "alibaba" || key === "dashscope") return "aliyun";
  if (key === "volcengine" || key === "volc" || key === "ark") return "volcengine";
  return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
}

function sanitizeRuntimeModel(value) {
  const model = String(value || "")
    .trim()
    .slice(0, 180);
  return model;
}

function sanitizeOpenRouterPreset(value) {
  return String(value || "")
    .trim()
    .slice(0, 120);
}

function sanitizeOpenRouterWebPluginEngine(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "native") return "native";
  if (key === "exa") return "exa";
  return "auto";
}

function sanitizeOpenRouterPdfEngine(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "pdf-text" || key === "mistral-ocr" || key === "native") return key;
  return "auto";
}

function sanitizeAliyunSearchStrategy(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (ALIYUN_SEARCH_STRATEGIES.includes(key)) return key;
  return DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchStrategy;
}

function sanitizeAliyunSearchCitationFormat(value) {
  const text = String(value || "").trim();
  if (ALIYUN_SEARCH_CITATION_FORMATS.includes(text)) return text;
  return DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchCitationFormat;
}

function sanitizeAliyunSearchFreshness(value) {
  const num = sanitizeRuntimeInteger(value, 0, 0, 365);
  if (ALIYUN_SEARCH_FRESHNESS_OPTIONS.includes(num)) return num;
  return DEFAULT_AGENT_RUNTIME_CONFIG.aliyunSearchFreshness;
}

function sanitizeAliyunAssignedSiteList(value, fallback = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : Array.isArray(fallback)
        ? fallback
        : [];
  const uniq = new Set();
  const list = [];
  source.slice(0, 80).forEach((item) => {
    const normalized = normalizeAliyunAssignedSite(item);
    if (!normalized) return;
    if (uniq.has(normalized)) return;
    uniq.add(normalized);
    list.push(normalized);
  });
  return list.slice(0, 25);
}

function normalizeAliyunAssignedSite(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!raw) return "";
  if (!raw.includes(".")) return "";
  if (!/^[a-z0-9.-]+$/.test(raw)) return "";
  return raw.slice(0, 120);
}

function sanitizeAliyunPromptIntervene(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 240);
}

function sanitizeAliyunFileProcessMode(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "native_oss_url" || key === "native") return "native_oss_url";
  return "local_parse";
}

function sanitizeEnableThinking(value) {
  return sanitizeRuntimeBoolean(
    value,
    DEFAULT_AGENT_RUNTIME_CONFIG.enableThinking,
  );
}

function sanitizeCreativityMode(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "precise" || key === "balanced" || key === "creative" || key === "custom") {
    return key;
  }
  return "balanced";
}

function sanitizeRuntimeNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeRuntimeInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const normalized = Math.round(num);
  return Math.min(max, Math.max(min, normalized));
}

function sanitizeRuntimeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return fallback;
  if (key === "1" || key === "true" || key === "yes" || key === "on") return true;
  if (key === "0" || key === "false" || key === "no" || key === "off")
    return false;
  return fallback;
}

function sanitizeReasoningEffort(value, fallback = "high") {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "none" || key === "low" || key === "medium" || key === "high") {
    return key;
  }
  const safeFallback = String(fallback || "")
    .trim()
    .toLowerCase();
  if (
    safeFallback === "none" ||
    safeFallback === "low" ||
    safeFallback === "medium" ||
    safeFallback === "high"
  ) {
    return safeFallback;
  }
  return "high";
}

function sanitizeSmartContextMode(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "regenerate" || key === "regen") return "regenerate";
  return "append";
}

function buildAdminAgentSettingsResponse(config) {
  const resolvedPrompts = resolveAgentSystemPrompts(config.prompts);
  const resolvedRuntimeConfigs = resolveAgentRuntimeConfigs(config.runtimeConfigs);
  return {
    ok: true,
    defaultSystemPrompt: getDefaultSystemPrompt(),
    prompts: config.prompts,
    resolvedPrompts,
    runtimeConfigs: config.runtimeConfigs,
    resolvedRuntimeConfigs,
    agentProviderDefaults: buildAgentProviderDefaults(),
    agentModelDefaults: buildAgentModelDefaults(),
    updatedAt: config.updatedAt,
  };
}

function buildAgentProviderDefaults() {
  const defaults = {};
  AGENT_IDS.forEach((agentId) => {
    defaults[agentId] = getProviderByAgent(agentId, { provider: "inherit" });
  });
  return defaults;
}

function buildAgentModelDefaults() {
  const defaults = {};
  AGENT_IDS.forEach((agentId) => {
    defaults[agentId] = getModelByAgent(agentId, { model: "" });
  });
  return defaults;
}

function sanitizeSystemPrompt(value) {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "");
  if (!text.trim()) return "";
  return text.slice(0, SYSTEM_PROMPT_MAX_LENGTH);
}

function getProviderByAgent(agentId, runtimeConfig = null) {
  const runtimeProvider = sanitizeRuntimeProvider(runtimeConfig?.provider);
  if (runtimeProvider !== "inherit") {
    return normalizeProvider(runtimeProvider);
  }

  const defaults = {
    A: "volcengine",
    B: "volcengine",
    C: "volcengine",
    D: AGENT_D_FIXED_PROVIDER,
  };
  const targetAgent = sanitizeAgent(agentId);
  const map = {
    A: process.env.AGENT_PROVIDER_A || defaults.A,
    B: process.env.AGENT_PROVIDER_B || defaults.B,
    C: process.env.AGENT_PROVIDER_C || defaults.C,
    D: defaults.D,
  };
  return normalizeProvider(map[targetAgent] || map.A);
}

function resolveReasoningPolicy(model, requested, provider) {
  const requestedEffort = sanitizeReasoningEffort(requested, "high");
  const supports = modelSupportsReasoning(model);
  const requires = modelRequiresReasoning(model);
  const providerAllows = providerSupportsReasoning(provider);

  if (!providerAllows) {
    return { enabled: false, effort: "none", forced: requestedEffort !== "none" };
  }

  if (requires && requestedEffort === "none") {
    return { enabled: true, effort: "high", forced: true };
  }

  if (!supports) {
    return { enabled: false, effort: "none", forced: requestedEffort !== "none" };
  }

  if (requestedEffort === "none") {
    return { enabled: false, effort: "none", forced: false };
  }

  return { enabled: true, effort: requestedEffort, forced: false };
}

function modelSupportsReasoning(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("gemini-3-flash-preview")) return false;
  return true;
}

function modelRequiresReasoning(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("deepseek-r1")) return true;
  return false;
}

function providerSupportsReasoning(provider) {
  return true;
}

function normalizeProvider(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "openrouter") return "openrouter";
  if (key === "aliyun" || key === "alibaba" || key === "dashscope")
    return "aliyun";
  if (key === "volcengine" || key === "volc" || key === "ark")
    return "volcengine";
  return "openrouter";
}

function getProviderConfig(provider) {
  if (provider === "aliyun") {
    return buildAliyunProviderConfig({
      env: process.env,
      apiKey: readEnvApiKey("ALIYUN_API_KEY", "DASHSCOPE_API_KEY"),
    });
  }

  if (provider === "volcengine") {
    return {
      chatEndpoint:
        process.env.VOLCENGINE_CHAT_ENDPOINT ||
        "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      responsesEndpoint:
        process.env.VOLCENGINE_RESPONSES_ENDPOINT ||
        "https://ark.cn-beijing.volces.com/api/v3/responses",
      filesEndpoint:
        process.env.VOLCENGINE_FILES_ENDPOINT ||
        "https://ark.cn-beijing.volces.com/api/v3/files",
      apiKey: readEnvApiKey("VOLCENGINE_API_KEY", "ARK_API_KEY"),
      missingKeyMessage:
        "未检测到火山引擎 API Key。请在 .env 中配置 VOLCENGINE_API_KEY（或 ARK_API_KEY）。",
    };
  }

  return {
    chatEndpoint:
      process.env.OPENROUTER_CHAT_ENDPOINT ||
      "https://openrouter.ai/api/v1/chat/completions",
    responsesEndpoint: "",
    apiKey: readEnvApiKey(
      "OPENROUTER_API_KEY",
      "OPEN_ROUTER_API_KEY",
      "OPENAI_API_KEY",
    ),
    missingKeyMessage:
      "未检测到 OpenRouter API Key。请在 .env 中配置 OPENROUTER_API_KEY（或 OPEN_ROUTER_API_KEY / OPENAI_API_KEY）。",
  };
}

function readEnvApiKey(...names) {
  for (const name of names) {
    const raw = String(process.env[name] || "").trim();
    if (!raw) continue;
    if (isPlaceholderApiKey(raw)) continue;
    return raw;
  }
  return "";
}

function isPlaceholderApiKey(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return true;
  if (key.startsWith("your_") && key.includes("api_key")) return true;
  if (key.includes("replace_me")) return true;
  if (key.includes("your-api-key")) return true;
  if (key.includes("xxxx")) return true;
  return false;
}

function buildProviderHeaders(provider, apiKey, protocol = "chat") {
  if (provider === "aliyun") {
    return buildAliyunHeaders({
      apiKey,
      protocol,
    });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept:
      protocol === "responses"
        ? "text/event-stream, application/json"
        : "text/event-stream",
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_REFERER || "http://localhost:5173";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "EduChat";
  }

  return headers;
}

function extractRequestFailureCode(error) {
  const cause = error?.cause && typeof error.cause === "object" ? error.cause : null;
  const code = sanitizeText(cause?.code || error?.code, "", 80)
    .trim()
    .toUpperCase();
  if (code) return code;
  const causeName = sanitizeText(cause?.name, "", 80)
    .trim()
    .toLowerCase();
  if (causeName.includes("timeout")) return "TIMEOUT";
  return "";
}

function isRetryableRequestFailure(error) {
  const code = extractRequestFailureCode(error);
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_SOCKET"
  );
}

function formatProviderRequestFailure(provider, protocol, endpoint, error) {
  const safeProvider = sanitizeText(provider, "upstream", 60);
  const safeProtocol = sanitizeText(protocol, "chat", 40);
  const baseMessage = sanitizeText(error?.message, "fetch failed", 300);
  const cause = error?.cause && typeof error.cause === "object" ? error.cause : null;
  const causeMessage = sanitizeText(cause?.message, "", 400);
  const code = extractRequestFailureCode(error);

  let endpointHost = "";
  try {
    endpointHost = new URL(String(endpoint || "")).host;
  } catch {
    endpointHost = "";
  }

  if (safeProvider === "aliyun" && safeProtocol === "dashscope") {
    if (code === "ENOTFOUND") {
      return `aliyun/dashscope request failed: 无法解析域名${endpointHost ? `（${endpointHost}）` : ""}，请检查本机 DNS / 网络。`;
    }
    if (
      code === "ETIMEDOUT" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_HEADERS_TIMEOUT" ||
      code === "TIMEOUT"
    ) {
      return `aliyun/dashscope request failed: 连接超时${endpointHost ? `（${endpointHost}）` : ""}，请稍后重试。`;
    }
    if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
      return `aliyun/dashscope request failed: 连接被重置${endpointHost ? `（${endpointHost}）` : ""}，请重试。`;
    }
    if (code === "ECONNREFUSED") {
      return `aliyun/dashscope request failed: 目标拒绝连接${endpointHost ? `（${endpointHost}）` : ""}。`;
    }
  }

  const details = [];
  if (endpointHost) details.push(`host=${endpointHost}`);
  if (code) details.push(`code=${code}`);
  if (causeMessage) details.push(`cause=${causeMessage}`);
  const detailText = details.length > 0 ? ` (${details.join("; ")})` : "";
  return `${safeProvider}/${safeProtocol} request failed: ${baseMessage}${detailText}`;
}

async function sendProviderRequestWithRetry({
  endpoint,
  headers,
  body,
  provider,
  protocol,
}) {
  const maxAttempts = provider === "aliyun" && protocol === "dashscope" ? 2 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(endpoint, {
        method: "POST",
        headers,
        body,
      });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableRequestFailure(error)) {
        throw error;
      }
      await sleepMs(250 * attempt);
    }
  }

  throw lastError || new Error("request failed");
}

function formatProviderUpstreamError(provider, protocol, status, detail) {
  const parsed = parseUpstreamErrorDetail(detail);
  const raw = parsed.raw;
  const errorCode = parsed.code;
  const errorMessage = parsed.message;
  const errorParam = parsed.param;

  if (
    provider === "openrouter" &&
    status === 401 &&
    /cookie auth credentials/i.test(raw)
  ) {
    return "OpenRouter 认证失败：未检测到有效 API Key。请在 .env 中配置真实 OPENROUTER_API_KEY（不是示例占位符），然后重启服务。";
  }

  if (provider === "openrouter" && status === 401) {
    return "OpenRouter 认证失败：请检查 OPENROUTER_API_KEY 是否正确且仍有效。";
  }

  if (
    provider === "openrouter" &&
    status === 403 &&
    /not available in your region/i.test(`${errorMessage} ${raw}`)
  ) {
    return "OpenRouter 拒绝了当前模型：该模型在你所在地区不可用，请更换模型后重试。";
  }

  if (provider === "volcengine") {
    const volcengineMapped = mapVolcengineUpstreamError({
      status,
      code: errorCode,
      message: errorMessage,
      param: errorParam,
    });
    if (volcengineMapped) return volcengineMapped;
  }

  if (provider === "aliyun") {
    return formatAliyunUpstreamError({
      status,
      code: errorCode,
      message: errorMessage,
      raw,
    });
  }

  return `${provider}/${protocol} error (${status}): ${errorMessage || raw || "unknown error"}`;
}

function parseUpstreamErrorDetail(detail) {
  const raw = String(detail || "").trim();
  if (!raw) {
    return {
      raw: "",
      code: "",
      message: "",
      param: "",
      type: "",
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const payload =
    parsed && typeof parsed.error === "object" && parsed.error
      ? parsed.error
      : parsed && typeof parsed === "object"
        ? parsed
        : {};

  return {
    raw,
    code: String(payload?.code || "").trim(),
    message: String(payload?.message || raw).trim(),
    param: String(payload?.param || "").trim(),
    type: String(payload?.type || "").trim(),
  };
}

function mapVolcengineUpstreamError({ status, code, message, param }) {
  const codeKey = String(code || "")
    .trim()
    .toLowerCase();
  const msg = String(message || "")
    .trim()
    .toLowerCase();
  const paramKey = String(param || "")
    .trim()
    .toLowerCase();

  if (
    status === 400 &&
    (paramKey === "image_url" ||
      paramKey === "image" ||
      msg.includes("do not support image input"))
  ) {
    return "该模型不支持图片解析。（Error Code: 400）";
  }

  if (
    status === 400 &&
    (msg.includes("reasoning") || msg.includes("thinking") || paramKey === "reasoning")
  ) {
    return "当前模型不支持所选深度思考参数，请调整后重试。（Error Code: 400）";
  }

  if (status === 400) {
    if (codeKey.startsWith("missingparameter")) {
      return "请求缺少必要参数，请检查后重试。（Error Code: 400）";
    }
    if (
      codeKey.startsWith("invalidparameter") ||
      codeKey.startsWith("invalidargumenterror")
    ) {
      return "请求参数不合法，请检查参数配置后重试。（Error Code: 400）";
    }
    if (
      codeKey.includes("sensitivecontentdetected") ||
      codeKey.includes("riskdetection")
    ) {
      return "输入或输出内容可能涉及敏感信息，请调整后重试。（Error Code: 400）";
    }
    return "请求参数错误，请检查参数配置后重试。（Error Code: 400）";
  }

  if (status === 401) {
    if (codeKey === "authenticationerror") {
      return "鉴权失败，请检查 API Key 是否正确。（Error Code: 401）";
    }
    return "认证失败，请检查账号状态或鉴权配置。（Error Code: 401）";
  }

  if (status === 403) {
    if (codeKey.includes("serviceoverdue") || codeKey === "accountoverdueerror") {
      return "账号欠费或服务已过期，请检查火山账户计费状态。（Error Code: 403）";
    }
    if (codeKey.includes("accessdenied")) {
      return "当前账号无权限访问该模型或资源。（Error Code: 403）";
    }
    return "无权限执行该操作，请检查模型开通与权限设置。（Error Code: 403）";
  }

  if (status === 404) {
    if (codeKey.includes("modelnotopen")) {
      return "该模型未开通，请先在火山方舟控制台开通模型服务。（Error Code: 404）";
    }
    return "模型或资源不存在，或当前账号无访问权限。（Error Code: 404）";
  }

  if (status === 429) {
    return "请求频率或配额超限，请稍后重试。（Error Code: 429）";
  }

  if (status === 500) {
    return "服务内部异常，请稍后重试。（Error Code: 500）";
  }

  if (status === 503) {
    return "服务暂时不可用，请稍后重试。（Error Code: 503）";
  }

  return "";
}

function requireChatAuth(req, res, next) {
  const token = readBearerToken(req);
  const payload = verifyToken(token);
  if (!payload || !payload.uid || payload.scope !== "chat") {
    res.status(401).json({ error: "登录状态无效或已过期，请重新登录。" });
    return;
  }

  AuthUser.findById(payload.uid)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: "账号不存在，请重新登录。" });
        return;
      }
      req.authUser = user;
      next();
    })
    .catch((error) => {
      next(error);
    });
}

function resolveImageHistoryAuthUserId(req) {
  const bearerToken = readBearerToken(req);
  const queryToken = String(req.query?.token || "").trim();
  const token = bearerToken || queryToken;
  const payload = verifyToken(token);
  if (!payload || payload.scope !== "chat" || !payload.uid) return "";
  return sanitizeId(payload.uid, "");
}

async function requireAdminAuth(req, res, next) {
  try {
    const admin = await authenticateAdminRequest(req, res);
    if (!admin) return;
    req.authAdmin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

function readJsonLikeField(raw, fallback) {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  if (raw && typeof raw === "object") return raw;
  return fallback;
}

function readRequestMessages(rawMessages) {
  const parsed = readJsonLikeField(rawMessages, []);
  return Array.isArray(parsed) ? parsed : [];
}

function readRequestVolcengineFileRefs(raw) {
  const parsed = readJsonLikeField(raw, []);
  return Array.isArray(parsed) ? sanitizeVolcengineFileRefsPayload(parsed) : [];
}

function readRequestPreparedAttachmentRefs(raw) {
  const parsed = readJsonLikeField(raw, []);
  return Array.isArray(parsed) ? sanitizePreparedAttachmentRefsPayload(parsed) : [];
}

function defaultChatState() {
  return {
    activeId: "s1",
    groups: [{ id: "g1", name: "新组", description: "" }],
    sessions: [{ id: "s1", title: "新对话 1", groupId: null, pinned: false }],
    sessionMessages: {
      s1: [
        {
          id: "m1",
          role: "assistant",
          content: "你好，今天做点啥？",
          firstTextAt: new Date().toISOString(),
        },
      ],
    },
    settings: {
      agent: "A",
      agentBySession: {},
      apiTemperature: 0.6,
      apiTopP: 1,
      apiReasoningEffort: "high",
      lastAppliedReasoning: "high",
      smartContextEnabled: false,
      smartContextEnabledBySessionAgent: {},
    },
  };
}

function normalizeChatStateDoc(doc) {
  if (!doc) return defaultChatState();
  return sanitizeChatStatePayload({
    activeId: doc.activeId,
    groups: doc.groups,
    sessions: doc.sessions,
    sessionMessages: doc.sessionMessages,
    settings: doc.settings,
  });
}

function sanitizeChatStatePayload(payload) {
  const fallback = defaultChatState();
  const groups = sanitizeGroups(payload.groups);
  const sessions = sanitizeSessions(payload.sessions, groups);
  const sessionMessages = sanitizeSessionMessages(payload.sessionMessages, sessions);
  const activeId = resolveActiveId(payload.activeId, sessions, fallback.activeId);
  const settings = sanitizeStateSettings(payload.settings);

  return {
    activeId,
    groups,
    sessions,
    sessionMessages,
    settings,
  };
}

function sanitizeChatStateMetaPayload(payload) {
  const fallback = defaultChatState();
  const groups = sanitizeGroups(payload.groups);
  const sessions = sanitizeSessions(payload.sessions, groups);
  const activeId = resolveActiveId(payload.activeId, sessions, fallback.activeId);
  const settings = sanitizeStateSettings(payload.settings);
  return { activeId, groups, sessions, settings };
}

function sanitizeSessionMessageUpsertsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const rawUpserts = Array.isArray(source.upserts) ? source.upserts : [];
  const deduped = new Map();

  rawUpserts.slice(0, 200).forEach((item, idx) => {
    const sessionId = sanitizeId(item?.sessionId, "");
    if (!sessionId) return;
    const message = sanitizeMessage(item?.message, idx);
    if (!message?.id) return;
    deduped.set(`${sessionId}::${message.id}`, { sessionId, message });
  });

  return Array.from(deduped.values());
}

function sanitizeSmartContextMapAgentId(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();
  if (["A", "B", "C", "D", AGENT_E_ID].includes(key)) return key;
  return "";
}

function buildSmartContextEnabledMapKey(sessionId, agentId) {
  const safeSessionId = sanitizeId(sessionId, "");
  const safeAgentId = sanitizeSmartContextMapAgentId(agentId);
  if (!safeSessionId || !safeAgentId) return "";
  return `${safeSessionId}::${safeAgentId}`;
}

function sanitizeSmartContextEnabledBySessionAgent(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = {};

  Object.entries(source)
    .slice(0, 1200)
    .forEach(([rawKey, rawValue]) => {
      if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
        const safeSessionId = sanitizeId(rawKey, "");
        if (!safeSessionId) return;
        Object.entries(rawValue)
          .slice(0, 8)
          .forEach(([rawAgentId, nestedValue]) => {
            const key = buildSmartContextEnabledMapKey(safeSessionId, rawAgentId);
            if (!key) return;
            normalized[key] = sanitizeRuntimeBoolean(nestedValue, false);
          });
        return;
      }

      const [rawSessionId, rawAgentId] = String(rawKey || "").split("::");
      const key = buildSmartContextEnabledMapKey(rawSessionId, rawAgentId);
      if (!key) return;
      normalized[key] = sanitizeRuntimeBoolean(rawValue, false);
    });

  return normalized;
}

function sanitizeAgentBySession(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = {};

  Object.entries(source)
    .slice(0, 1200)
    .forEach(([rawSessionId, rawAgentId]) => {
      const sessionId = sanitizeId(rawSessionId, "");
      const agentId = sanitizeSmartContextMapAgentId(rawAgentId);
      if (!sessionId || !agentId) return;
      normalized[sessionId] = agentId;
    });

  return normalized;
}

function sanitizeStateSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const agent = sanitizeAgent(source.agent);
  const agentBySession = sanitizeAgentBySession(source.agentBySession);
  const apiTemperature = sanitizeNumber(source.apiTemperature, 0.6, 0, 2);
  const apiTopP = sanitizeNumber(source.apiTopP, 1, 0, 1);
  const apiReasoningEffort = sanitizeReasoning(source.apiReasoningEffort, "high");
  const lastAppliedReasoning = sanitizeReasoning(source.lastAppliedReasoning, "high");
  const smartContextEnabled = sanitizeRuntimeBoolean(source.smartContextEnabled, false);
  const smartContextEnabledBySessionAgent = sanitizeSmartContextEnabledBySessionAgent(
    source.smartContextEnabledBySessionAgent,
  );

  return {
    agent,
    agentBySession,
    apiTemperature,
    apiTopP,
    apiReasoningEffort,
    lastAppliedReasoning,
    smartContextEnabled,
    smartContextEnabledBySessionAgent,
  };
}

function sanitizeGroups(input) {
  if (!Array.isArray(input)) return [{ id: "g1", name: "新组", description: "" }];

  const used = new Set();
  const normalized = [];
  input.slice(0, 80).forEach((item, idx) => {
    const id = sanitizeId(item?.id, `g${idx + 1}`);
    if (used.has(id)) return;
    used.add(id);
    normalized.push({
      id,
      name: sanitizeText(item?.name, "新组", 30),
      description: sanitizeText(item?.description, "", 120),
    });
  });

  if (normalized.length === 0) {
    return [{ id: "g1", name: "新组", description: "" }];
  }
  return normalized;
}

function sanitizeSessions(input, groups) {
  if (!Array.isArray(input)) {
    return [{ id: "s1", title: "新对话 1", groupId: null, pinned: false }];
  }
  const groupIds = new Set(groups.map((g) => g.id));
  const used = new Set();
  const normalized = [];

  input.slice(0, 600).forEach((item, idx) => {
    const id = sanitizeId(item?.id, `s${idx + 1}`);
    if (used.has(id)) return;
    used.add(id);

    const rawGroup = String(item?.groupId || "").trim();
    normalized.push({
      id,
      title: sanitizeText(item?.title, "新对话", 80),
      groupId: rawGroup && groupIds.has(rawGroup) ? rawGroup : null,
      pinned: !!item?.pinned,
    });
  });

  if (normalized.length === 0) {
    return [{ id: "s1", title: "新对话 1", groupId: null, pinned: false }];
  }

  return normalized;
}

function sanitizeSessionMessages(input, sessions) {
  const sessionIds = new Set(sessions.map((s) => s.id));
  const source = input && typeof input === "object" ? input : {};
  const normalized = {};

  sessions.forEach((session) => {
    const rawMessages = Array.isArray(source[session.id]) ? source[session.id] : [];
    normalized[session.id] = rawMessages.slice(0, 400).map((m, idx) =>
      sanitizeMessage(m, idx),
    );
  });

  if (Object.keys(normalized).length === 0) {
    normalized.s1 = defaultChatState().sessionMessages.s1;
  }

  // 清除不存在 session 的脏键
  Object.keys(normalized).forEach((key) => {
    if (!sessionIds.has(key)) delete normalized[key];
  });

  return normalized;
}

function sanitizeMessage(msg, idx) {
  const role = ["user", "assistant", "system"].includes(msg?.role)
    ? msg.role
    : "assistant";
  const attachments = Array.isArray(msg?.attachments)
    ? msg.attachments.slice(0, 8).map((a) => {
        const fileId = sanitizeText(a?.fileId, "", 160);
        const inputType = String(a?.inputType || "")
          .trim()
          .toLowerCase();
        const safeInputType =
          inputType === "input_file" ||
          inputType === "input_image" ||
          inputType === "input_video"
            ? inputType
            : "";
        const attachmentUrl = sanitizeGroupChatHttpUrl(a?.url || a?.fileUrl);
        const ossKey = sanitizeGroupChatOssObjectKey(a?.ossKey);

        return {
          name: sanitizeText(a?.name, "文件", 120),
          type: sanitizeText(a?.type, "", 120),
          size: Number.isFinite(Number(a?.size)) ? Number(a.size) : undefined,
          ...(fileId ? { fileId } : {}),
          ...(fileId && safeInputType ? { inputType: safeInputType } : {}),
          ...(attachmentUrl ? { url: attachmentUrl } : {}),
          ...(ossKey ? { ossKey } : {}),
        };
      })
    : [];

  return {
    id: sanitizeId(msg?.id, `m${idx + 1}`),
    role,
    content: sanitizeText(msg?.content, "", 24000),
    reasoning: sanitizeText(msg?.reasoning, "", 24000),
    feedback:
      msg?.feedback === "up" || msg?.feedback === "down" ? msg.feedback : null,
    attachments,
    askedAt: sanitizeIsoDate(msg?.askedAt),
    startedAt: sanitizeIsoDate(msg?.startedAt),
    firstTextAt: sanitizeIsoDate(msg?.firstTextAt),
    regenerateOf: sanitizeText(msg?.regenerateOf, "", 80) || null,
    runtime:
      msg?.runtime && typeof msg.runtime === "object"
        ? {
            agentId: sanitizeText(msg.runtime.agentId, "", 32),
            agentName: sanitizeText(msg.runtime.agentName, "", 64),
            model: sanitizeText(msg.runtime.model, "", 120),
            provider: sanitizeText(msg.runtime.provider, "", 64),
            temperature: Number.isFinite(Number(msg.runtime.temperature))
              ? Number(msg.runtime.temperature)
              : undefined,
            topP: Number.isFinite(Number(msg.runtime.topP))
              ? Number(msg.runtime.topP)
              : undefined,
            reasoningRequested: sanitizeText(msg.runtime.reasoningRequested, "", 16),
            reasoningApplied: sanitizeText(msg.runtime.reasoningApplied, "", 16),
          }
        : undefined,
  };
}

function resolveActiveId(activeId, sessions, fallback) {
  const id = sanitizeId(activeId, fallback);
  if (sessions.some((s) => s.id === id)) return id;
  return sessions[0]?.id || fallback;
}

function sanitizeUserProfile(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      name: "",
      studentId: "",
      gender: "",
      grade: "",
      className: "",
    };
  }

  return {
    name: sanitizeText(raw.name, "", 20),
    studentId: sanitizeText(raw.studentId, "", 20),
    gender: sanitizeText(raw.gender, "", 12),
    grade: sanitizeText(raw.grade, "", 20),
    className: sanitizeText(raw.className, "", 40),
  };
}

function validateUserProfile(profile) {
  const errors = {};
  if (!profile.name) {
    errors.name = "请输入姓名";
  } else if (!/^[\u4e00-\u9fa5]+$/.test(profile.name)) {
    errors.name = "姓名仅支持汉字";
  }

  if (!profile.studentId) {
    errors.studentId = "请输入学号";
  } else if (!/^\d{1,20}$/.test(profile.studentId)) {
    errors.studentId = "学号仅支持数字，最多 20 位";
  }

  const genderOptions = ["男", "女"];
  if (!genderOptions.includes(profile.gender)) {
    errors.gender = "请选择性别";
  }

  const gradeOptions = [
    "7年级",
    "8年级",
    "9年级",
    "高一",
    "高二",
    "高三",
    "大学一年级",
    "大学二年级",
    "大学三年级",
    "大学四年级",
    "硕士研究生",
    "博士研究生",
  ];
  if (!gradeOptions.includes(profile.grade)) {
    errors.grade = "请选择年级";
  }

  if (!profile.className) {
    errors.className = "请输入班级";
  }
  return errors;
}

function isUserProfileComplete(profile) {
  return Object.keys(validateUserProfile(profile)).length === 0;
}

function sanitizeId(value, fallback = "") {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.$]/g, "");
  if (!text) return fallback || "";
  return text.slice(0, 80);
}

function sanitizePreparedAttachmentToken(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return "";
  if (!/^[a-z0-9]{20,96}$/.test(text)) return "";
  return text;
}

function sanitizeText(value, fallback = "", maxLen = 200) {
  const text = String(value ?? fallback).trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
}

function sanitizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function sanitizeAgent(value) {
  const id = String(value || "")
    .trim()
    .toUpperCase();
  if (["A", "B", "C", "D", AGENT_E_ID].includes(id)) return id;
  return "A";
}

function sanitizeReasoning(value, fallback = "high") {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (
    key === "none" ||
    key === "off" ||
    key === "no" ||
    key === "false" ||
    key === "0"
  ) {
    return "none";
  }
  if (!key) return fallback;
  return "high";
}

function sanitizeNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeGroupChatRoomName(value) {
  const text = sanitizeText(value, "", GROUP_CHAT_ROOM_NAME_MAX_LENGTH);
  if (!text) return "";
  return text;
}

function sanitizeGroupChatText(value) {
  return sanitizeText(value, "", GROUP_CHAT_TEXT_MAX_LENGTH);
}

function sanitizeGroupChatCode(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d-]/g, "");
  if (!/^\d{3}-\d{3}-\d{3}$/.test(normalized)) return "";
  return normalized;
}

function sanitizeGroupChatAfterDate(value) {
  const iso = sanitizeIsoDate(value);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildGroupChatDisplayName(user) {
  const profileName = sanitizeText(user?.profile?.name, "", 30);
  if (profileName) return profileName;
  return sanitizeText(user?.username, "用户", 30);
}

function createGroupChatRoomCodeCandidate() {
  const a = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const b = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const c = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${a}-${b}-${c}`;
}

async function generateUniqueGroupChatRoomCode() {
  for (let i = 0; i < 16; i += 1) {
    const candidate = createGroupChatRoomCodeCandidate();
    // 极短码空间下先做存在性探测，避免冲突导致的写失败重试。
    const existing = await GroupChatRoom.exists({ roomCode: candidate });
    if (!existing) return candidate;
  }
  throw new Error("群号生成失败，请稍后重试。");
}

function sanitizeGroupChatMemberUserIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => sanitizeId(item, ""))
        .filter(Boolean),
    ),
  ).slice(0, GROUP_CHAT_MAX_MEMBERS_PER_ROOM);
}

function normalizeGroupChatReadStates(value, roomMemberUserIds = []) {
  const memberSet = new Set(sanitizeGroupChatMemberUserIds(roomMemberUserIds));
  if (!Array.isArray(value)) return [];
  const deduped = new Map();
  value.forEach((item) => {
    const userId = sanitizeId(item?.userId, "");
    if (!userId || !memberSet.has(userId)) return;
    const lastReadMessageId = sanitizeId(item?.lastReadMessageId, "");
    const lastReadAt = sanitizeIsoDate(item?.lastReadAt);
    const updatedAt = sanitizeIsoDate(item?.updatedAt) || new Date().toISOString();
    deduped.set(userId, {
      userId,
      lastReadMessageId,
      lastReadAt,
      updatedAt,
    });
  });
  return Array.from(deduped.values())
    .sort((a, b) => toGroupChatDateTimestamp(a.updatedAt) - toGroupChatDateTimestamp(b.updatedAt))
    .slice(-GROUP_CHAT_MAX_READ_STATES_PER_ROOM);
}

function getGroupChatOnlineUserIdsByRoom(roomId) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return [];
  const roomCounter = groupChatWsOnlineCountsByRoom.get(safeRoomId);
  if (!roomCounter) return [];
  return Array.from(roomCounter.entries())
    .filter(([, count]) => Number(count) > 0)
    .map(([userId]) => sanitizeId(userId, ""))
    .filter(Boolean);
}

function normalizeGroupChatRoomDoc(doc, options = {}) {
  if (!doc) return null;
  const viewerUserId = sanitizeId(options?.viewerUserId, "");
  const id = sanitizeId(doc?._id, "");
  if (!id) return null;
  const memberUserIds = sanitizeGroupChatMemberUserIds(doc.memberUserIds);
  const ownerUserId = sanitizeId(doc.ownerUserId, "");
  const onlineMemberUserIds = Array.from(
    new Set(getGroupChatOnlineUserIdsByRoom(id).filter((userId) => memberUserIds.includes(userId))),
  );

  const normalized = {
    id,
    roomCode: sanitizeGroupChatCode(doc.roomCode),
    name: sanitizeGroupChatRoomName(doc.name),
    ownerUserId,
    memberUserIds,
    memberCount: Math.max(memberUserIds.length, sanitizeRuntimeInteger(doc.memberCount, 1, 1, 999)),
    createdAt: sanitizeIsoDate(doc.createdAt),
    updatedAt: sanitizeIsoDate(doc.updatedAt),
    onlineMemberUserIds,
  };

  if (viewerUserId && viewerUserId === ownerUserId) {
    normalized.readStates = normalizeGroupChatReadStates(doc.readStates, memberUserIds);
  }

  return normalized;
}

function normalizeGroupChatFilesApiInputType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "input_image" || key === "image") return "input_image";
  if (key === "input_file" || key === "file") return "input_file";
  if (key === "input_video" || key === "video") return "input_video";
  return "";
}

function normalizeGroupChatFilesApiStatus(value, fallback = "") {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (
    key === "uploaded" ||
    key === "not_supported" ||
    key === "expired" ||
    key === "failed" ||
    key === "missing"
  ) {
    return key;
  }
  return String(fallback || "")
    .trim()
    .toLowerCase();
}

function normalizeGroupChatFilesApiMeta(raw, { defaultInputType = "" } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const fileId = sanitizeText(source.fileId, "", 180);
  const inputType =
    normalizeGroupChatFilesApiInputType(source.inputType) ||
    normalizeGroupChatFilesApiInputType(defaultInputType);
  const uploadedAt = sanitizeIsoDate(source.uploadedAt);
  const expiresAt = sanitizeIsoDate(source.expiresAt);
  const status = normalizeGroupChatFilesApiStatus(
    source.status,
    fileId ? "uploaded" : "missing",
  );
  return {
    status: status || "missing",
    fileId,
    inputType,
    uploadedAt,
    expiresAt,
  };
}

function normalizeGroupChatFileOssMeta(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const ossKey = sanitizeGroupChatOssObjectKey(source.ossKey);
  const fileUrl = sanitizeGroupChatHttpUrl(source.fileUrl);
  const uploaded =
    sanitizeRuntimeBoolean(source.uploaded, false) || !!ossKey || !!fileUrl;
  return {
    uploaded,
    ossKey,
    ossBucket: sanitizeAliyunOssBucket(source.ossBucket),
    ossRegion: sanitizeAliyunOssRegion(source.ossRegion),
    fileUrl,
  };
}

function isGroupChatFilesApiExpired(filesApiMeta, { nowMs = Date.now() } = {}) {
  const expiresAt = sanitizeIsoDate(filesApiMeta?.expiresAt);
  if (!expiresAt) return false;
  return toGroupChatDateTimestamp(expiresAt) > 0 && toGroupChatDateTimestamp(expiresAt) <= nowMs;
}

function resolveGroupChatFileExtension(fileName, mimeType = "") {
  const ext = getFileExtension(fileName);
  if (ext) return ext.toLowerCase();
  const mime = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (mime.startsWith("image/")) {
    return mime.replace("image/", "").replace("jpeg", "jpg");
  }
  if (mime.includes("pdf")) return "pdf";
  return "";
}

function classifyGroupChatVolcengineSupportedInputType({
  fileName = "",
  mimeType = "",
  fallbackType = "",
} = {}) {
  const explicitInputType = normalizeGroupChatFilesApiInputType(fallbackType);
  if (explicitInputType === "input_image" || explicitInputType === "input_file") {
    return explicitInputType;
  }

  const ext = getFileExtension(fileName);
  const mime = sanitizeGroupChatFileMimeType(mimeType).toLowerCase();

  if (mime.includes("pdf") || ext === "pdf") {
    return "input_file";
  }

  const normalizedExt = String(ext || "").trim().toLowerCase();
  const imageByMime = GROUP_CHAT_VOLCENGINE_SUPPORTED_IMAGE_MIME_TYPES.has(mime);
  const imageByExt = GROUP_CHAT_VOLCENGINE_SUPPORTED_IMAGE_EXTENSIONS.has(normalizedExt);
  const mimeIsImage = mime.startsWith("image/");

  if ((imageByMime || imageByExt) && (mimeIsImage || !mime || mime === "application/octet-stream")) {
    return "input_image";
  }
  return "";
}

function normalizeGroupChatRoomFileItemFromMessageDoc(doc) {
  const normalized = normalizeGroupChatMessageDoc(doc);
  if (!normalized || (normalized.type !== "file" && normalized.type !== "image")) return null;
  const nowMs = Date.now();
  const isImage = normalized.type === "image";
  const payload = isImage ? normalized.image : normalized.file;
  if (!payload) return null;

  const filesApiMeta = normalizeGroupChatFilesApiMeta(
    payload?.filesApi,
    { defaultInputType: isImage ? "input_image" : "input_file" },
  );
  const filesApiExpired = isGroupChatFilesApiExpired(filesApiMeta, { nowMs });
  const filesApiStatus = filesApiExpired
    ? "expired"
    : normalizeGroupChatFilesApiStatus(filesApiMeta.status, filesApiMeta.fileId ? "uploaded" : "missing");
  const ossMeta = normalizeGroupChatFileOssMeta(payload?.oss);
  const fileName = isImage
    ? sanitizeGroupChatImageFileName(payload?.fileName)
    : sanitizeGroupChatFileName(payload?.fileName);
  const mimeType = sanitizeGroupChatFileMimeType(payload?.mimeType);
  const extension = resolveGroupChatFileExtension(fileName, mimeType);

  return {
    messageId: sanitizeId(normalized.id, ""),
    roomId: sanitizeId(normalized.roomId, ""),
    type: normalized.type,
    senderUserId: sanitizeId(normalized.senderUserId, ""),
    senderName: sanitizeText(normalized.senderName, "用户", 30),
    fileName,
    extension,
    mimeType,
    size: sanitizeRuntimeInteger(
      payload?.size,
      0,
      0,
      isImage ? GROUP_CHAT_IMAGE_MAX_FILE_SIZE_BYTES : GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES,
    ),
    createdAt: sanitizeIsoDate(normalized.createdAt),
    localParseOnly: isImage ? false : sanitizeRuntimeBoolean(payload?.localParseOnly, false),
    parseHint: isImage
      ? ""
      : sanitizeText(payload?.parseHint, "", 120),
    filesApi: {
      status: filesApiStatus || "missing",
      uploaded: filesApiStatus === "uploaded",
      fileId: sanitizeText(filesApiMeta.fileId, "", 180),
      inputType: normalizeGroupChatFilesApiInputType(filesApiMeta.inputType),
      uploadedAt: sanitizeIsoDate(filesApiMeta.uploadedAt),
      expiresAt: sanitizeIsoDate(filesApiMeta.expiresAt),
    },
    oss: {
      uploaded: !!ossMeta.uploaded,
      ossKey: sanitizeGroupChatOssObjectKey(ossMeta.ossKey),
      ossBucket: sanitizeAliyunOssBucket(ossMeta.ossBucket),
      ossRegion: sanitizeAliyunOssRegion(ossMeta.ossRegion),
      fileUrl: sanitizeGroupChatHttpUrl(ossMeta.fileUrl),
    },
  };
}

function normalizeGroupChatMessageDoc(doc) {
  if (!doc) return null;
  const id = sanitizeId(doc?._id, "");
  const roomId = sanitizeId(doc?.roomId, "");
  if (!id || !roomId) return null;
  const type = String(doc?.type || "")
    .trim()
    .toLowerCase();
  if (type !== "text" && type !== "image" && type !== "file" && type !== "system") return null;

  const normalized = {
    id,
    roomId,
    type,
    senderUserId: sanitizeId(doc?.senderUserId, ""),
    senderName: sanitizeText(doc?.senderName, type === "system" ? "系统" : "用户", 30),
    content: sanitizeText(doc?.content, "", GROUP_CHAT_TEXT_MAX_LENGTH),
    replyToMessageId: sanitizeId(doc?.replyToMessageId, ""),
    replyPreviewText: sanitizeText(
      doc?.replyPreviewText,
      "",
      GROUP_CHAT_REPLY_PREVIEW_MAX_LENGTH,
    ),
    replySenderName: sanitizeText(doc?.replySenderName, "", 30),
    replyType: sanitizeText(doc?.replyType, "", 12).toLowerCase(),
    mentionNames: Array.from(
      new Set(
        (Array.isArray(doc?.mentionNames) ? doc.mentionNames : [])
          .map((item) => sanitizeText(item, "", 30))
          .filter(Boolean),
      ),
    ).slice(0, 12),
    reactions: normalizeGroupChatReactions(doc?.reactions),
    createdAt: sanitizeIsoDate(doc?.createdAt),
  };

  if (type === "image") {
    const image = doc?.image && typeof doc.image === "object" ? doc.image : {};
    const dataUrl = String(image.dataUrl || "").trim();
    normalized.image = {
      dataUrl,
      mimeType: sanitizeText(image.mimeType, "image/png", 80).toLowerCase(),
      fileName: sanitizeGroupChatImageFileName(image.fileName),
      size: sanitizeRuntimeInteger(image.size, 0, 0, GROUP_CHAT_IMAGE_MAX_FILE_SIZE_BYTES),
      filesApi: normalizeGroupChatFilesApiMeta(image.filesApi, {
        defaultInputType: "input_image",
      }),
      oss: normalizeGroupChatFileOssMeta(image.oss),
    };
  } else {
    normalized.image = null;
  }

  if (type === "file") {
    const file = doc?.file && typeof doc.file === "object" ? doc.file : {};
    normalized.file = {
      fileId: sanitizeId(file.fileId, ""),
      fileName: sanitizeGroupChatFileName(file.fileName),
      mimeType: sanitizeGroupChatFileMimeType(file.mimeType),
      size: sanitizeRuntimeInteger(file.size, 0, 0, GROUP_CHAT_FILE_MAX_FILE_SIZE_BYTES),
      expiresAt: sanitizeIsoDate(file.expiresAt),
      localParseOnly: sanitizeRuntimeBoolean(file.localParseOnly, false),
      parseHint: sanitizeText(file.parseHint, "", 120),
      filesApi: normalizeGroupChatFilesApiMeta(file.filesApi, {
        defaultInputType: "input_file",
      }),
      oss: normalizeGroupChatFileOssMeta(file.oss),
    };
  } else {
    normalized.file = null;
  }

  return normalized;
}

function sanitizeGroupChatImageFileName(value) {
  const text = normalizeGroupChatUploadedFileName(value)
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return "group-image.png";
  const cleaned = text
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < 32) return "_";
      if (`<>:"/\\|?*`.includes(char)) return "_";
      return char;
    })
    .join("");
  return cleaned.slice(0, 80);
}

function sanitizeGroupChatFileName(value) {
  const text = normalizeGroupChatUploadedFileName(value)
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return "group-file.bin";
  const cleaned = text
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < 32) return "_";
      if (`<>:"/\\|?*`.includes(char)) return "_";
      return char;
    })
    .join("");
  return cleaned.slice(0, 120);
}

function buildAttachmentContentDisposition(fileName) {
  const safeName = sanitizeGroupChatFileName(fileName);
  const fallbackAsciiName = toAsciiHeaderFileName(safeName);
  const encodedName = encodeRfc5987ValueChars(safeName);
  return `attachment; filename="${fallbackAsciiName}"; filename*=UTF-8''${encodedName}`;
}

function toAsciiHeaderFileName(fileName) {
  const text = String(fileName || "").trim();
  if (!text) return "download.bin";

  const ascii = text
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!ascii) return "download.bin";
  if (ascii === "." || ascii === "..") return "download.bin";
  return ascii;
}

function encodeRfc5987ValueChars(value) {
  return encodeURIComponent(String(value || "download.bin"))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sanitizeGroupChatFileMimeType(value) {
  const mimeType = String(value || "")
    .trim()
    .toLowerCase();
  if (!mimeType) return "application/octet-stream";
  if (mimeType.length > 120) return "application/octet-stream";
  return mimeType;
}

function normalizeGroupChatUploadedFileName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const candidates = new Set([raw]);
  const uriDecoded = decodeGroupChatMaybeUriComponent(raw);
  if (uriDecoded) {
    candidates.add(uriDecoded);
  }

  const rfc2047Decoded = decodeGroupChatMaybeRfc2047(raw);
  if (rfc2047Decoded) {
    candidates.add(rfc2047Decoded);
    const rfcUriDecoded = decodeGroupChatMaybeUriComponent(rfc2047Decoded);
    if (rfcUriDecoded) {
      candidates.add(rfcUriDecoded);
    }
  }

  // Recover common UTF-8 -> latin1 mojibake; some clients may encode twice.
  Array.from(candidates).forEach((item) => {
    let current = item;
    for (let round = 0; round < 2; round += 1) {
      if (!looksLikeGroupChatMojibake(current)) break;
      const recovered = decodeGroupChatLatin1ToUtf8(current);
      if (!recovered || recovered === current) break;
      candidates.add(recovered);
      current = recovered;
    }
  });

  let best = raw;
  let bestScore = scoreGroupChatFileNameCandidate(raw);
  candidates.forEach((item) => {
    const candidate = String(item || "").trim();
    if (!candidate) return;
    const score = scoreGroupChatFileNameCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}

function decodeGroupChatMaybeUriComponent(value) {
  const text = String(value || "").trim();
  if (!text || !/%[0-9a-f]{2}/i.test(text)) return "";
  try {
    return decodeURIComponent(text).trim();
  } catch {
    return "";
  }
}

function decodeGroupChatMaybeRfc2047(value) {
  const text = String(value || "").trim();
  const match = text.match(/^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/i);
  if (!match || !match[1]) return "";
  try {
    return Buffer.from(match[1], "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

function decodeGroupChatLatin1ToUtf8(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return Buffer.from(text, "latin1").toString("utf8").trim();
  } catch {
    return "";
  }
}

function looksLikeGroupChatMojibake(value) {
  const text = String(value || "");
  if (!text) return false;
  if (text.includes("�")) return true;
  return /(?:Ã.|Â.|â.|æ.|å.|è.|ä.|ç.|ð.|ï.)/.test(text);
}

function scoreGroupChatFileNameCandidate(value) {
  const text = String(value || "").trim();
  if (!text) return -1000;
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const replacementCount = (text.match(/�/g) || []).length;
  const controlCount = Array.from(text).reduce((count, char) => {
    const code = char.charCodeAt(0);
    return code < 32 ? count + 1 : count;
  }, 0);

  let score = 0;
  score += Math.min(cjkCount * 8, 160);
  if (/^[\x20-\x7e]+$/.test(text)) {
    score += 8;
  }
  if (/\.[A-Za-z0-9]{1,8}$/.test(text)) {
    score += 3;
  }
  score -= replacementCount * 20;
  score -= controlCount * 5;
  if (looksLikeGroupChatMojibake(text) && cjkCount === 0) {
    score -= 14;
  }
  return score;
}

function buildGroupChatFileExpireAt() {
  if (groupChatOssClient) return null;
  return new Date(Date.now() + GROUP_CHAT_FILE_TTL_MS);
}

function sanitizeAliyunOssNetworkMode(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  if (
    key === "public" ||
    key === "public_only" ||
    key === "external" ||
    key === "external_only" ||
    key === "internet"
  ) {
    return "public";
  }
  if (
    key === "internal_prefer" ||
    key === "prefer_internal" ||
    key === "internal" ||
    key === "intranet"
  ) {
    return "internal_prefer";
  }
  if (
    key === "internal_only" ||
    key === "strict_internal" ||
    key === "intranet_only"
  ) {
    return "internal_only";
  }
  return "";
}

function resolveAliyunOssNetworkMode() {
  const explicitMode = sanitizeAliyunOssNetworkMode(process.env.ALIYUN_OSS_NETWORK_MODE);
  if (explicitMode) return explicitMode;
  const legacyInternal = sanitizeRuntimeBoolean(process.env.ALIYUN_OSS_INTERNAL, false);
  return legacyInternal ? "internal_prefer" : "public";
}

function buildGroupChatOssConfig() {
  const networkMode = resolveAliyunOssNetworkMode();
  const internal = networkMode !== "public";
  const enableTimeoutFallback = networkMode === "internal_prefer";
  const bucket = sanitizeAliyunOssBucket(process.env.ALIYUN_OSS_BUCKET);
  const accessKeyId = String(process.env.ALIYUN_ACCESS_KEY_ID || "").trim();
  const accessKeySecret = String(process.env.ALIYUN_ACCESS_KEY_SECRET || "").trim();
  const region = sanitizeAliyunOssRegion(
    process.env.ALIYUN_OSS_REGION || GROUP_CHAT_OSS_DEFAULT_REGION,
  );
  const endpointRaw = sanitizeAliyunOssEndpoint(process.env.ALIYUN_OSS_ENDPOINT);
  const endpoint =
    networkMode === "public"
      ? normalizeGroupChatOssPublicEndpoint(endpointRaw) || endpointRaw
      : endpointRaw;
  const objectPrefix = sanitizeAliyunOssObjectPrefix(
    process.env.ALIYUN_OSS_OBJECT_PREFIX || GROUP_CHAT_OSS_DEFAULT_PREFIX,
  );
  const secure = sanitizeRuntimeBoolean(process.env.ALIYUN_OSS_SECURE, true);
  const publicRead = sanitizeRuntimeBoolean(process.env.ALIYUN_OSS_PUBLIC_READ, false);
  const signedUrlTtlSeconds = sanitizeRuntimeInteger(
    process.env.ALIYUN_OSS_SIGNED_URL_TTL_SECONDS,
    GROUP_CHAT_OSS_SIGNED_URL_TTL_SECONDS_DEFAULT,
    60,
    GROUP_CHAT_OSS_SIGNED_URL_TTL_SECONDS_MAX,
  );

  const hasAnyOssEnv =
    !!bucket ||
    !!accessKeyId ||
    !!accessKeySecret ||
    !!String(process.env.ALIYUN_OSS_REGION || "").trim() ||
    !!String(process.env.ALIYUN_OSS_ENDPOINT || "").trim();
  if (!bucket || !accessKeyId || !accessKeySecret) {
    if (hasAnyOssEnv) {
      console.warn(
        "[group-chat-file-storage] OSS 配置不完整，请检查 ALIYUN_OSS_BUCKET / ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET。",
      );
    }
    return null;
  }

  return {
    bucket,
    region,
    endpoint,
    accessKeyId,
    accessKeySecret,
    objectPrefix,
    internal,
    networkMode,
    enableTimeoutFallback,
    secure,
    publicRead,
    signedUrlTtlSeconds,
  };
}

function createGroupChatOssClient(config) {
  if (!config) return null;
  try {
    const options = {
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      internal: !!config.internal,
      secure: !!config.secure,
    };
    if (config.endpoint) {
      options.endpoint = config.endpoint;
    }
    return new OSS(options);
  } catch (error) {
    console.warn(
      "[group-chat-file-storage] OSS 客户端初始化失败：",
      error?.message || error,
    );
    return null;
  }
}

function createGroupChatOssClients(config) {
  const primary = createGroupChatOssClient(config);
  if (!primary) {
    return { primary: null, fallback: null };
  }
  if (!config?.internal || !config?.enableTimeoutFallback) {
    return { primary, fallback: null };
  }

  const fallbackEndpoint = normalizeGroupChatOssPublicEndpoint(config.endpoint);
  const fallback = createGroupChatOssClient({
    ...config,
    internal: false,
    endpoint: fallbackEndpoint || "",
  });
  return {
    primary,
    fallback: fallback || null,
  };
}

function isGroupChatOssConnectionTimeoutError(error) {
  const code = String(error?.code || "").trim().toLowerCase();
  if (code === "connectiontimeouterror" || code === "timeout") return true;
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  return message.includes("timeout");
}

function isGroupChatOssAccessDeniedError(error) {
  const code = String(error?.code || "").trim().toLowerCase();
  if (code === "accessdenied" || code === "forbidden") return true;
  const status = Number(error?.status);
  if (status === 403) return true;
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  return message.includes("access denied") || message.includes("does not belong to you");
}

async function callGroupChatOssWithTimeoutFallback(operationName, primaryCall, fallbackCall) {
  if (!groupChatOssClient) {
    throw new Error("OSS 客户端未初始化");
  }
  try {
    return await primaryCall(groupChatOssClient);
  } catch (error) {
    if (!groupChatOssFallbackClient || !isGroupChatOssConnectionTimeoutError(error)) {
      throw error;
    }
    console.warn(
      `[group-chat-file-storage] OSS ${operationName} 内网连接超时，回退公网重试。`,
    );
    try {
      return await fallbackCall(groupChatOssFallbackClient);
    } catch (fallbackError) {
      console.warn(
        `[group-chat-file-storage] OSS ${operationName} 公网回退仍失败：${formatGroupChatOssError(fallbackError)}`,
      );
      throw fallbackError;
    }
  }
}

function sanitizeAliyunOssBucket(value) {
  const bucket = String(value || "")
    .trim()
    .toLowerCase();
  if (!bucket) return "";
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return "";
  return bucket;
}

function sanitizeAliyunOssRegion(value) {
  const region = String(value || "")
    .trim()
    .toLowerCase();
  if (!region) return GROUP_CHAT_OSS_DEFAULT_REGION;
  if (!/^oss-[a-z0-9-]+$/.test(region)) return GROUP_CHAT_OSS_DEFAULT_REGION;
  return region;
}

function sanitizeAliyunOssEndpoint(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (!raw) return "";
  const host = raw.split("/")[0] || "";
  if (!host) return "";
  if (/[\s]/.test(host)) return "";
  return host;
}

function sanitizeAliyunOssObjectPrefix(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) =>
      String(segment || "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-"),
    )
    .filter(Boolean)
    .join("/");
  return cleaned || GROUP_CHAT_OSS_DEFAULT_PREFIX;
}

function sanitizeGroupChatFileStorageType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "oss") return "oss";
  return "mongo";
}

function sanitizeGroupChatOssObjectKey(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!raw) return "";
  if (raw.length > 900) return "";
  const normalized = raw
    .split("/")
    .map((segment) => String(segment || "").trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  return normalized;
}

function sanitizeGroupChatHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function resolveGroupChatOssBucketHost(config) {
  const bucket = sanitizeAliyunOssBucket(config?.bucket);
  if (!bucket) return "";
  const endpoint = sanitizeAliyunOssEndpoint(config?.endpoint);
  if (endpoint) {
    const normalizedEndpoint = normalizeGroupChatOssPublicEndpoint(endpoint);
    if (normalizedEndpoint.startsWith(`${bucket}.`)) return normalizedEndpoint;
    return `${bucket}.${normalizedEndpoint}`;
  }
  const region = sanitizeAliyunOssRegion(config?.region);
  return `${bucket}.${region}.aliyuncs.com`;
}

function normalizeGroupChatOssPublicEndpoint(endpoint) {
  const host = sanitizeAliyunOssEndpoint(endpoint);
  if (!host) return "";
  return host.replace(/-internal\.aliyuncs\.com$/i, ".aliyuncs.com");
}

function encodeGroupChatOssObjectKeyPath(key) {
  const safe = sanitizeGroupChatOssObjectKey(key);
  if (!safe) return "";
  return safe
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildGroupChatOssObjectKey({ roomId, fileName }) {
  const safeRoomId = sanitizeId(roomId, "") || "unknown-room";
  const safeFileName = sanitizeGroupChatFileName(fileName).replace(/\s+/g, "_");
  const randomPart = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  const objectPrefix = sanitizeAliyunOssObjectPrefix(groupChatOssConfig?.objectPrefix);
  return `${objectPrefix}/${safeRoomId}/${timestamp}-${randomPart}-${safeFileName}`;
}

function sanitizeGroupChatOssScopeSegment(value, fallback = "misc") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return fallback;
  return cleaned.slice(0, 80);
}

function resolveFileExtensionByMimeType(mimeType, fallback = "bin") {
  const mime = sanitizeGroupChatFileMimeType(mimeType);
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/json": "json",
  };
  const mapped = map[mime];
  if (mapped) return mapped;
  return sanitizeGroupChatOssScopeSegment(fallback || "bin", "bin");
}

function buildRuntimeOssObjectKey({ scope, userId = "", sessionId = "", fileName = "" }) {
  const objectPrefix = sanitizeAliyunOssObjectPrefix(groupChatOssConfig?.objectPrefix);
  const safeScope = sanitizeGroupChatOssScopeSegment(scope, "misc");
  const safeUserSegment =
    sanitizeId(userId, "") || sanitizeGroupChatOssScopeSegment(userId, "anonymous");
  const safeSessionSegment =
    sanitizeId(sessionId, "") || sanitizeGroupChatOssScopeSegment(sessionId, "");
  const randomPart = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  const safeFileName = sanitizeGroupChatFileName(fileName)
    .replace(/\s+/g, "_")
    .slice(0, 120);
  const segments = [objectPrefix, safeScope, safeUserSegment];
  if (safeSessionSegment) {
    segments.push(safeSessionSegment);
  }
  return `${segments.join("/")}/${timestamp}-${randomPart}-${safeFileName}`;
}

async function uploadBufferToGroupChatOss({
  scope,
  userId = "",
  sessionId = "",
  fileName = "",
  mimeType = "application/octet-stream",
  dataBuffer,
  cacheControl = "private, no-store",
}) {
  if (!groupChatOssClient || !groupChatOssConfig) return null;
  const safeBuffer = extractGeneratedImageDataBuffer(dataBuffer);
  if (!safeBuffer.length) {
    throw new Error("文件内容为空，无法上传到 OSS。");
  }
  const safeMimeType = sanitizeGroupChatFileMimeType(mimeType);
  const safeFileName = sanitizeGroupChatFileName(fileName);
  const ossKey = buildRuntimeOssObjectKey({
    scope,
    userId,
    sessionId,
    fileName: safeFileName,
  });
  await callGroupChatOssWithTimeoutFallback(
    `put(${ossKey})`,
    async (client) =>
      client.put(ossKey, safeBuffer, {
        headers: {
          "Content-Type": safeMimeType,
          "Content-Disposition": buildAttachmentContentDisposition(safeFileName),
          "Cache-Control": cacheControl || "private, no-store",
        },
      }),
    async (client) =>
      client.put(ossKey, safeBuffer, {
        headers: {
          "Content-Type": safeMimeType,
          "Content-Disposition": buildAttachmentContentDisposition(safeFileName),
          "Cache-Control": cacheControl || "private, no-store",
        },
      }),
  );

  return {
    fileName: safeFileName,
    mimeType: safeMimeType,
    size: safeBuffer.length,
    storageType: "oss",
    ossKey,
    ossBucket: groupChatOssConfig.bucket,
    ossRegion: groupChatOssConfig.region,
    fileUrl: buildGroupChatOssObjectUrl(ossKey),
  };
}

function sanitizeChatAttachmentOssSource(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return "unknown";
  return text.slice(0, 80);
}

async function uploadChatAttachmentsToOss({
  files = [],
  userId = "",
  sessionId = "",
  source = "",
  stopOnError = true,
}) {
  if (!groupChatOssClient || !groupChatOssConfig) return [];
  const sourceTag = sanitizeChatAttachmentOssSource(source);
  const uploadedList = [];
  const sourceFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  for (let idx = 0; idx < sourceFiles.length; idx += 1) {
    const file = sourceFiles[idx];
    const originalName = sanitizeGroupChatFileName(
      file?.originalname || `chat-attachment-${idx + 1}.bin`,
    );
    const mimeType = sanitizeGroupChatFileMimeType(file?.mimetype);
    const safeBuffer = extractGeneratedImageDataBuffer(file?.buffer);
    if (!safeBuffer.length) continue;
    try {
      const uploaded = await uploadBufferToGroupChatOss({
        scope: CHAT_ATTACHMENT_OSS_SCOPE,
        userId,
        sessionId,
        fileName: originalName,
        mimeType,
        dataBuffer: safeBuffer,
        cacheControl: "private, no-store",
      });
      if (uploaded) {
        uploadedList.push({
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
          source: sourceTag,
          ossKey: uploaded.ossKey,
          ossBucket: uploaded.ossBucket,
          ossRegion: uploaded.ossRegion,
          fileUrl: uploaded.fileUrl,
        });
      }
    } catch (error) {
      if (stopOnError) {
        throw new Error(
          `上传附件到 OSS 失败（${originalName}）：${error?.message || "unknown error"}`,
        );
      }
      console.warn(
        `[chat-file-storage] 附件备份到 OSS 失败（source=${sourceTag}, file=${originalName}）：`,
        error?.message || error,
      );
    }
  }
  return uploadedList;
}

function backupChatAttachmentsToOssInBackground({
  files = [],
  userId = "",
  sessionId = "",
  source = "",
}) {
  if (!groupChatOssClient || !groupChatOssConfig) return;
  const sourceTag = sanitizeChatAttachmentOssSource(source);
  void uploadChatAttachmentsToOss({
    files,
    userId,
    sessionId,
    source: sourceTag,
    stopOnError: false,
  })
    .then((uploadedList) => {
      if (uploadedList.length > 0) {
        console.log(
          `[chat-file-storage] 已完成附件 OSS 后台备份：source=${sourceTag}, count=${uploadedList.length}`,
        );
      }
    })
    .catch((error) => {
      console.warn(
        `[chat-file-storage] 附件 OSS 后台备份任务异常（source=${sourceTag}）：`,
        error?.message || error,
      );
    });
}

function buildGroupChatOssObjectUrl(ossKey) {
  if (!groupChatOssConfig) return "";
  const safeKey = sanitizeGroupChatOssObjectKey(ossKey);
  if (!safeKey) return "";
  const protocol = groupChatOssConfig.secure ? "https" : "http";
  const host = resolveGroupChatOssBucketHost(groupChatOssConfig);
  const publicBaseUrl = host ? `${protocol}://${host}` : "";

  if (groupChatOssClient) {
    try {
      const generated = publicBaseUrl
        ? groupChatOssClient.generateObjectUrl(safeKey, publicBaseUrl)
        : groupChatOssClient.generateObjectUrl(safeKey);
      return sanitizeGroupChatHttpUrl(generated);
    } catch (error) {
      console.warn(
        `[group-chat-file-storage] OSS 对象直链生成失败（${safeKey}）：`,
        error?.message || error,
      );
    }
  }

  const encodedKey = encodeGroupChatOssObjectKeyPath(safeKey);
  if (!host || !encodedKey) return "";
  return `${protocol}://${host}/${encodedKey}`;
}

async function buildGroupChatFileSignedDownloadUrl({ ossKey, fileName }) {
  if (!groupChatOssClient || !groupChatOssConfig) return "";
  const safeKey = sanitizeGroupChatOssObjectKey(ossKey);
  if (!safeKey) return "";
  const safeFileName = sanitizeGroupChatFileName(fileName);

  try {
    return await groupChatOssClient.asyncSignatureUrl(safeKey, {
      method: "GET",
      expires: groupChatOssConfig.signedUrlTtlSeconds,
      response: {
        "content-disposition": buildAttachmentContentDisposition(safeFileName),
      },
    });
  } catch (error) {
    console.warn(
      `[group-chat-file-storage] OSS 签名下载地址生成失败（${safeKey}）：`,
      error?.message || error,
    );
    return "";
  }
}

async function buildGroupChatStoredFileStoragePayload({
  roomId,
  fileName,
  mimeType,
  fileBuffer,
}) {
  const safeBuffer = extractGeneratedImageDataBuffer(fileBuffer);
  if (!groupChatOssClient || !groupChatOssConfig) {
    throw new Error("未配置阿里云 OSS，无法发送群聊文件。");
  }
  if (!safeBuffer.length) {
    throw new Error("文件内容为空，无法上传到 OSS。");
  }

  const safeFileName = sanitizeGroupChatFileName(fileName);
  const safeMimeType = sanitizeGroupChatFileMimeType(mimeType);
  const ossKey = buildGroupChatOssObjectKey({ roomId, fileName: safeFileName });

  try {
    await callGroupChatOssWithTimeoutFallback(
      `put(${ossKey})`,
      async (client) =>
        client.put(ossKey, safeBuffer, {
          headers: {
            "Content-Type": safeMimeType,
            "Content-Disposition": buildAttachmentContentDisposition(safeFileName),
            "Cache-Control": "private, no-store",
          },
        }),
      async (client) =>
        client.put(ossKey, safeBuffer, {
          headers: {
            "Content-Type": safeMimeType,
            "Content-Disposition": buildAttachmentContentDisposition(safeFileName),
            "Cache-Control": "private, no-store",
          },
        }),
    );
  } catch (error) {
    throw new Error(`上传文件到 OSS 失败：${error?.message || "unknown error"}`);
  }

  return {
    storageType: "oss",
    ossKey,
    ossBucket: groupChatOssConfig.bucket,
    ossRegion: groupChatOssConfig.region,
    fileUrl: buildGroupChatOssObjectUrl(ossKey),
    data: Buffer.alloc(0),
  };
}

async function deleteGroupChatOssObject(ossKey) {
  const safeKey = sanitizeGroupChatOssObjectKey(ossKey);
  if (!safeKey || !groupChatOssClient) return false;
  try {
    await callGroupChatOssWithTimeoutFallback(
      `delete(${safeKey})`,
      async (client) => client.delete(safeKey),
      async (client) => client.delete(safeKey),
    );
    return true;
  } catch (error) {
    if (isGroupChatOssNotFoundError(error)) return false;
    throw error;
  }
}

function readGroupChatOssStartupCheckConfig() {
  return {
    enabled: sanitizeRuntimeBoolean(process.env.ALIYUN_OSS_STARTUP_CHECK_ENABLED, true),
    writeProbe: sanitizeRuntimeBoolean(process.env.ALIYUN_OSS_STARTUP_WRITE_PROBE, true),
    timeoutMs: sanitizeRuntimeInteger(
      process.env.ALIYUN_OSS_STARTUP_CHECK_TIMEOUT_MS,
      GROUP_CHAT_OSS_STARTUP_CHECK_TIMEOUT_MS_DEFAULT,
      1000,
      GROUP_CHAT_OSS_STARTUP_CHECK_TIMEOUT_MS_MAX,
    ),
  };
}

function buildGroupChatOssStartupProbeObjectKey() {
  const objectPrefix = sanitizeAliyunOssObjectPrefix(groupChatOssConfig?.objectPrefix);
  const randomPart = crypto.randomBytes(6).toString("hex");
  return `${objectPrefix}/_healthchecks/startup-${Date.now()}-${randomPart}.txt`;
}

function formatGroupChatOssError(error) {
  const message = String(error?.message || "unknown error").trim();
  const code = String(error?.code || "").trim();
  const status = Number(error?.status);
  const requestId = String(
    error?.requestId || error?.res?.headers?.["x-oss-request-id"] || "",
  ).trim();
  const details = [message];
  if (code) details.push(`code=${code}`);
  if (Number.isFinite(status) && status > 0) details.push(`status=${status}`);
  if (requestId) details.push(`requestId=${requestId}`);
  return details.join(" | ");
}

async function runGroupChatOssStartupHealthCheck() {
  if (!groupChatOssClient || !groupChatOssConfig) return;

  const checkConfig = readGroupChatOssStartupCheckConfig();
  let bucketLocationAccessDenied = false;
  if (!checkConfig.enabled) {
    console.log(
      "[group-chat-file-storage] OSS 启动检查已禁用（ALIYUN_OSS_STARTUP_CHECK_ENABLED=false）。",
    );
    return;
  }

  console.log(
    `[group-chat-file-storage] OSS 启动检查开始：bucket=${groupChatOssConfig.bucket}, region=${groupChatOssConfig.region}, networkMode=${groupChatOssConfig.networkMode}, internal=${groupChatOssConfig.internal}, publicRead=${groupChatOssConfig.publicRead}`,
  );

  try {
    const locationResult = await callGroupChatOssWithTimeoutFallback(
      `getBucketLocation(${groupChatOssConfig.bucket})`,
      async (client) =>
        client.getBucketLocation(groupChatOssConfig.bucket, {
          timeout: checkConfig.timeoutMs,
        }),
      async (client) =>
        client.getBucketLocation(groupChatOssConfig.bucket, {
          timeout: checkConfig.timeoutMs,
        }),
    );
    const bucketRegion = sanitizeAliyunOssRegion(locationResult?.location);
    if (bucketRegion && bucketRegion !== groupChatOssConfig.region) {
      console.warn(
        `[group-chat-file-storage] OSS 启动检查：Bucket 地域与配置不一致（bucket=${bucketRegion}, configured=${groupChatOssConfig.region}）。`,
      );
    } else {
      console.log(
        `[group-chat-file-storage] OSS 启动检查：Bucket 可访问，地域=${bucketRegion || groupChatOssConfig.region}。`,
      );
    }
  } catch (error) {
    if (isGroupChatOssAccessDeniedError(error)) {
      bucketLocationAccessDenied = true;
      console.warn(
        "[group-chat-file-storage] OSS 启动检查：Bucket 级别权限不足或 AK 不属于该 Bucket 账号（请核对 AK 所属账号与 Bucket 所属账号是否一致）。",
      );
    }
    console.warn(
      `[group-chat-file-storage] OSS 启动检查：Bucket 可达性检查失败（不影响服务启动）：${formatGroupChatOssError(error)}`,
    );
  }

  if (!checkConfig.writeProbe) {
    console.log(
      "[group-chat-file-storage] OSS 启动检查：已跳过写入探测（ALIYUN_OSS_STARTUP_WRITE_PROBE=false）。",
    );
    return;
  }

  const probeKey = buildGroupChatOssStartupProbeObjectKey();
  const probeBody = Buffer.from(`educhat oss startup check ${new Date().toISOString()}\n`);
  try {
    await callGroupChatOssWithTimeoutFallback(
      `put(${probeKey})`,
      async (client) =>
        client.put(probeKey, probeBody, {
          timeout: checkConfig.timeoutMs,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
      async (client) =>
        client.put(probeKey, probeBody, {
          timeout: checkConfig.timeoutMs,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
    );
  } catch (error) {
    console.warn(
      `[group-chat-file-storage] OSS 启动检查：写入探测失败（key=${probeKey}，不影响服务启动）：${formatGroupChatOssError(error)}`,
    );
    return;
  }

  try {
    await callGroupChatOssWithTimeoutFallback(
      `delete(${probeKey})`,
      async (client) =>
        client.delete(probeKey, {
          timeout: checkConfig.timeoutMs,
        }),
      async (client) =>
        client.delete(probeKey, {
          timeout: checkConfig.timeoutMs,
        }),
    );
    console.log("[group-chat-file-storage] OSS 启动检查通过：写入与删除能力正常。");
    if (bucketLocationAccessDenied) {
      console.log(
        "[group-chat-file-storage] OSS 启动检查补充：对象写删正常，说明当前 AK 至少具备对象级权限；仅 BucketLocation 权限可能缺失。",
      );
    }
  } catch (error) {
    if (isGroupChatOssAccessDeniedError(error)) {
      console.warn(
        "[group-chat-file-storage] OSS 启动检查：对象写删权限不足（请给该 AK/RAM 用户授予目标 Bucket 的 PutObject/DeleteObject 权限）。",
      );
    }
    console.warn(
      `[group-chat-file-storage] OSS 启动检查：删除探测对象失败（key=${probeKey}，不影响服务启动）：${formatGroupChatOssError(error)}`,
    );
  }
}

async function deleteGroupChatStoredFileObjects(storedFiles) {
  if (!groupChatOssClient) return { deletedCount: 0, failedKeys: [] };
  const keys = Array.from(
    new Set(
      (Array.isArray(storedFiles) ? storedFiles : [])
        .map((doc) => sanitizeGroupChatOssObjectKey(doc?.ossKey))
        .filter(Boolean),
    ),
  );
  let deletedCount = 0;
  const failedKeys = new Set();
  for (const key of keys) {
    try {
      const deleted = await deleteGroupChatOssObject(key);
      if (deleted) deletedCount += 1;
    } catch (error) {
      failedKeys.add(key);
      console.warn(
        `[group-chat-file-storage] 删除 OSS 文件失败（${key}）：`,
        error?.message || error,
      );
    }
  }
  return {
    deletedCount,
    failedKeys: Array.from(failedKeys),
  };
}

async function deleteGeneratedImageHistoryOssObjects(historyItems) {
  if (!groupChatOssClient) return { deletedCount: 0, failedKeys: [] };
  const docs = Array.isArray(historyItems) ? historyItems : [];
  const normalizedDocs = docs.map((item) => ({
    ossKey: sanitizeGroupChatOssObjectKey(item?.ossKey),
  }));
  return deleteGroupChatStoredFileObjects(normalizedDocs);
}

function isGroupChatOssNotFoundError(error) {
  if (Number(error?.status) === 404) return true;
  const code = String(error?.code || "")
    .trim()
    .toLowerCase();
  if (code === "nosuchkey" || code === "notfound") return true;
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  return message.includes("not found") || message.includes("no such key");
}

async function findGroupChatStoredFileByRoomAndId({
  roomId,
  fileId,
  projection = undefined,
}) {
  const safeRoomId = sanitizeId(roomId, "");
  const safeFileId = sanitizeId(fileId, "");
  if (!safeRoomId || !safeFileId) return null;

  let storedFileDoc = await GroupChatStoredFile.findOne(
    { _id: safeFileId, roomId: safeRoomId },
    projection,
  ).lean();
  if (storedFileDoc) return storedFileDoc;

  const legacyStoredFileDoc = await GroupChatStoredFile.findById(safeFileId, projection).lean();
  if (sanitizeId(legacyStoredFileDoc?.roomId, "") === safeRoomId) {
    storedFileDoc = legacyStoredFileDoc;
  }
  return storedFileDoc || null;
}

async function cleanupExpiredGroupChatStoredFiles() {
  if (!groupChatOssClient) return { deletedDocCount: 0, deletedObjectCount: 0 };

  let deletedDocCount = 0;
  let deletedObjectCount = 0;
  for (let round = 0; round < 20; round += 1) {
    const expiredDocs = await GroupChatStoredFile.find(
      {
        expiresAt: { $lte: new Date() },
        $or: [{ storageType: { $exists: false } }, { storageType: { $ne: "oss" } }],
      },
      { _id: 1, ossKey: 1 },
    )
      .sort({ expiresAt: 1, _id: 1 })
      .limit(GROUP_CHAT_OSS_EXPIRED_CLEANUP_BATCH_SIZE)
      .lean();
    if (!expiredDocs.length) break;

    const deleteSummary = await deleteGroupChatStoredFileObjects(expiredDocs);
    deletedObjectCount += Number(deleteSummary?.deletedCount || 0);
    const failedKeySet = new Set(
      Array.isArray(deleteSummary?.failedKeys) ? deleteSummary.failedKeys : [],
    );
    const expiredDocIds = expiredDocs
      .filter((doc) => {
        const key = sanitizeGroupChatOssObjectKey(doc?.ossKey);
        if (!key) return true;
        return !failedKeySet.has(key);
      })
      .map((doc) => doc?._id)
      .filter(Boolean);
    if (!expiredDocIds.length) break;

    const deleteResult = await GroupChatStoredFile.deleteMany({
      _id: { $in: expiredDocIds },
    });
    deletedDocCount += Number(deleteResult?.deletedCount || 0);
    if (expiredDocs.length < GROUP_CHAT_OSS_EXPIRED_CLEANUP_BATCH_SIZE) break;
  }

  return { deletedDocCount, deletedObjectCount };
}

function startGroupChatExpiredFileCleanupTask() {
  if (!groupChatOssClient) return;
  if (groupChatExpiredFileCleanupTimer) {
    clearInterval(groupChatExpiredFileCleanupTimer);
    groupChatExpiredFileCleanupTimer = null;
  }
  groupChatExpiredFileCleanupTimer = setInterval(() => {
    void cleanupExpiredGroupChatStoredFiles().catch((error) => {
      console.warn(
        "Failed to cleanup expired group chat OSS files:",
        error?.message || error,
      );
    });
  }, GROUP_CHAT_OSS_EXPIRED_CLEANUP_INTERVAL_MS);
  if (typeof groupChatExpiredFileCleanupTimer?.unref === "function") {
    groupChatExpiredFileCleanupTimer.unref();
  }
}

async function cleanupExpiredGeneratedImageHistories() {
  if (!groupChatOssClient) return { deletedDocCount: 0, deletedObjectCount: 0 };

  let deletedDocCount = 0;
  let deletedObjectCount = 0;
  for (let round = 0; round < 20; round += 1) {
    const expiredDocs = await GeneratedImageHistory.find(
      {
        expiresAt: { $lte: new Date() },
        $or: [{ imageStorageType: { $exists: false } }, { imageStorageType: { $ne: "oss" } }],
      },
      { _id: 1, ossKey: 1 },
    )
      .sort({ expiresAt: 1, _id: 1 })
      .limit(GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_BATCH_SIZE)
      .lean();
    if (!expiredDocs.length) break;

    const deleteSummary = await deleteGeneratedImageHistoryOssObjects(expiredDocs);
    deletedObjectCount += Number(deleteSummary?.deletedCount || 0);
    const failedKeySet = new Set(
      Array.isArray(deleteSummary?.failedKeys) ? deleteSummary.failedKeys : [],
    );
    const expiredDocIds = expiredDocs
      .filter((doc) => {
        const key = sanitizeGroupChatOssObjectKey(doc?.ossKey);
        if (!key) return true;
        return !failedKeySet.has(key);
      })
      .map((doc) => doc?._id)
      .filter(Boolean);
    if (!expiredDocIds.length) break;

    const deleteResult = await GeneratedImageHistory.deleteMany({
      _id: { $in: expiredDocIds },
    });
    deletedDocCount += Number(deleteResult?.deletedCount || 0);
    if (expiredDocs.length < GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_BATCH_SIZE) break;
  }

  return { deletedDocCount, deletedObjectCount };
}

function startGeneratedImageExpiredCleanupTask() {
  if (!groupChatOssClient) return;
  if (generatedImageExpiredCleanupTimer) {
    clearInterval(generatedImageExpiredCleanupTimer);
    generatedImageExpiredCleanupTimer = null;
  }
  generatedImageExpiredCleanupTimer = setInterval(() => {
    void cleanupExpiredGeneratedImageHistories().catch((error) => {
      console.warn(
        "Failed to cleanup expired generated image OSS files:",
        error?.message || error,
      );
    });
  }, GENERATED_IMAGE_OSS_EXPIRED_CLEANUP_INTERVAL_MS);
  if (typeof generatedImageExpiredCleanupTimer?.unref === "function") {
    generatedImageExpiredCleanupTimer.unref();
  }
}

async function migrateOssFilesToPermanentRetention() {
  if (!groupChatOssClient) return;

  try {
    const [groupFileResult, messageResult, imageHistoryResult] = await Promise.all([
      GroupChatStoredFile.updateMany(
        {
          expiresAt: { $exists: true, $ne: null },
          $or: [{ storageType: "oss" }, { ossKey: { $exists: true, $ne: "" } }],
        },
        {
          $set: {
            expiresAt: null,
          },
        },
      ),
      GroupChatMessage.updateMany(
        {
          type: "file",
          "file.expiresAt": { $exists: true, $ne: null },
        },
        {
          $set: {
            "file.expiresAt": null,
          },
        },
      ),
      GeneratedImageHistory.updateMany(
        {
          expiresAt: { $exists: true, $ne: null },
          $or: [{ imageStorageType: "oss" }, { ossKey: { $exists: true, $ne: "" } }],
        },
        {
          $set: {
            expiresAt: null,
          },
        },
      ),
    ]);

    const groupUpdated = Number(groupFileResult?.modifiedCount || 0);
    const messageUpdated = Number(messageResult?.modifiedCount || 0);
    const imageUpdated = Number(imageHistoryResult?.modifiedCount || 0);
    if (groupUpdated > 0 || messageUpdated > 0 || imageUpdated > 0) {
      console.log(
        `[group-chat-file-storage] OSS 永久保留迁移完成：groupFiles=${groupUpdated}, fileMessages=${messageUpdated}, generatedImages=${imageUpdated}`,
      );
    }
  } catch (error) {
    console.warn(
      "[group-chat-file-storage] OSS 永久保留迁移失败：",
      error?.message || error,
    );
  }
}

function sanitizeGroupChatReactionEmoji(value) {
  const safe = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!safe) return "";
  return Array.from(safe).slice(0, GROUP_CHAT_REACTION_EMOJI_MAX_SYMBOLS).join("");
}

function normalizeGroupChatReactions(value) {
  if (!Array.isArray(value)) return [];
  const map = new Map();
  value.forEach((item) => {
    const emoji = sanitizeGroupChatReactionEmoji(item?.emoji);
    const userId = sanitizeId(item?.userId, "");
    if (!emoji || !userId) return;
    map.set(userId, {
      emoji,
      userId,
      userName: sanitizeText(item?.userName, "用户", 30),
      createdAt: sanitizeIsoDate(item?.createdAt),
    });
  });

  return Array.from(map.values())
    .sort((a, b) => toGroupChatDateTimestamp(a.createdAt) - toGroupChatDateTimestamp(b.createdAt))
    .slice(-GROUP_CHAT_MAX_REACTIONS_PER_MESSAGE);
}

function toGroupChatDateTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function collectGroupChatMemberUserIds(rooms) {
  const ids = new Set();
  (Array.isArray(rooms) ? rooms : []).forEach((room) => {
    const memberUserIds = sanitizeGroupChatMemberUserIds(room?.memberUserIds);
    memberUserIds.forEach((id) => ids.add(id));
  });
  return Array.from(ids);
}

async function readGroupChatUsersByIds(userIds) {
  const ids = Array.from(
    new Set((Array.isArray(userIds) ? userIds : []).map((id) => sanitizeId(id, "")).filter(Boolean)),
  ).slice(0, 120);
  if (ids.length === 0) return {};
  const users = await AuthUser.find(
    { _id: { $in: ids } },
    { username: 1, profile: 1 },
  ).lean();
  const map = {};
  users.forEach((user) => {
    const id = sanitizeId(user?._id, "");
    if (!id) return;
    map[id] = {
      id,
      name: buildGroupChatDisplayName(user),
    };
  });
  return map;
}

async function createGroupChatSystemMessage({ roomId, content }) {
  const safeRoomId = sanitizeId(roomId, "");
  const safeContent = sanitizeText(content, "", GROUP_CHAT_TEXT_MAX_LENGTH);
  if (!safeRoomId || !safeContent) return null;
  return GroupChatMessage.create({
    roomId: safeRoomId,
    type: "system",
    senderUserId: "",
    senderName: "系统",
    content: safeContent,
  });
}

function collectMentionNames(content) {
  const text = String(content || "");
  const matches = text.match(/@([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g) || [];
  return Array.from(
    new Set(
      matches
        .map((item) => sanitizeText(String(item).slice(1), "", 30))
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

async function resolveGroupChatReplyMeta({ roomId, rawReplyToMessageId }) {
  const replyToMessageId = sanitizeId(rawReplyToMessageId, "");
  const safeRoomId = sanitizeId(roomId, "");
  if (!replyToMessageId || !isMongoObjectIdLike(replyToMessageId) || !isMongoObjectIdLike(safeRoomId)) {
    return {
      replyToMessageId: "",
      replyPreviewText: "",
      replySenderName: "",
      replyType: "",
    };
  }

  const replyDoc = await GroupChatMessage.findOne(
    { _id: replyToMessageId, roomId: safeRoomId },
    {
      type: 1,
      content: 1,
      senderName: 1,
    },
  ).lean();
  if (!replyDoc) {
    return {
      replyToMessageId: "",
      replyPreviewText: "",
      replySenderName: "",
      replyType: "",
    };
  }

  const replyType = sanitizeText(replyDoc?.type, "", 12).toLowerCase();
  const replyPreviewText =
    replyType === "image"
      ? "[图片]"
      : replyType === "file"
        ? "[文件]"
      : sanitizeText(replyDoc?.content, "", GROUP_CHAT_REPLY_PREVIEW_MAX_LENGTH);

  return {
    replyToMessageId,
    replyPreviewText,
    replySenderName: sanitizeText(replyDoc?.senderName, "用户", 30),
    replyType,
  };
}

function buildGroupChatReadStateMap(readStates = [], roomMemberUserIds = []) {
  const memberSet = new Set(sanitizeGroupChatMemberUserIds(roomMemberUserIds));
  const map = new Map();
  normalizeGroupChatReadStates(readStates, roomMemberUserIds).forEach((item) => {
    if (!memberSet.has(item.userId)) return;
    map.set(item.userId, item);
  });
  return map;
}

function buildGroupChatRoomReadStatesFromMap(map) {
  if (!(map instanceof Map) || map.size === 0) return [];
  return Array.from(map.values())
    .filter(Boolean)
    .map((item) => ({
      userId: sanitizeId(item.userId, ""),
      lastReadMessageId: sanitizeId(item.lastReadMessageId, ""),
      lastReadAt: item.lastReadAt ? new Date(item.lastReadAt) : null,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
    }))
    .filter((item) => !!item.userId)
    .slice(-GROUP_CHAT_MAX_READ_STATES_PER_ROOM);
}

async function updateGroupChatRoomReadState({
  roomId,
  userId,
  lastReadMessageId = "",
  lastReadAt = null,
}) {
  const safeRoomId = sanitizeId(roomId, "");
  const safeUserId = sanitizeId(userId, "");
  const safeMessageId = sanitizeId(lastReadMessageId, "");
  const safeReadAtIso = sanitizeIsoDate(lastReadAt);
  if (!safeRoomId || !safeUserId || !safeReadAtIso) return null;

  const room = await GroupChatRoom.findById(safeRoomId).lean();
  const normalizedRoom = normalizeGroupChatRoomDoc(room);
  if (!normalizedRoom) return null;
  if (!normalizedRoom.memberUserIds.includes(safeUserId)) return room;

  const readStateMap = buildGroupChatReadStateMap(room?.readStates, normalizedRoom.memberUserIds);
  const current = readStateMap.get(safeUserId);
  const currentTs = toGroupChatDateTimestamp(current?.lastReadAt);
  const nextTs = toGroupChatDateTimestamp(safeReadAtIso);
  if (nextTs < currentTs) {
    return room;
  }
  if (
    nextTs === currentTs &&
    sanitizeId(current?.lastReadMessageId, "") === safeMessageId
  ) {
    return room;
  }

  readStateMap.set(safeUserId, {
    userId: safeUserId,
    lastReadMessageId: safeMessageId,
    lastReadAt: safeReadAtIso,
    updatedAt: new Date().toISOString(),
  });

  const nextReadStates = buildGroupChatRoomReadStatesFromMap(readStateMap);
  return GroupChatRoom.findByIdAndUpdate(
    safeRoomId,
    {
      $set: {
        readStates: nextReadStates,
      },
    },
    { new: true },
  ).lean();
}

async function markGroupChatRoomReadByMessageId({ roomId, userId, messageId = "" }) {
  const safeRoomId = sanitizeId(roomId, "");
  const safeUserId = sanitizeId(userId, "");
  const safeMessageId = sanitizeId(messageId, "");
  if (!safeRoomId || !safeUserId) return null;

  let targetMessage = null;
  if (safeMessageId && isMongoObjectIdLike(safeMessageId)) {
    targetMessage = await GroupChatMessage.findOne(
      { _id: safeMessageId, roomId: safeRoomId },
      { _id: 1, createdAt: 1 },
    ).lean();
  } else {
    targetMessage = await GroupChatMessage.findOne(
      { roomId: safeRoomId },
      { _id: 1, createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!targetMessage) return null;
  const safeReadAt = sanitizeIsoDate(targetMessage.createdAt);
  if (!safeReadAt) return null;

  const updatedRoomDoc = await updateGroupChatRoomReadState({
    roomId: safeRoomId,
    userId: safeUserId,
    lastReadMessageId: sanitizeId(targetMessage?._id, safeMessageId),
    lastReadAt: safeReadAt,
  });
  if (!updatedRoomDoc) return null;

  const roomMemberUserIds = sanitizeGroupChatMemberUserIds(updatedRoomDoc?.memberUserIds);
  const readState = normalizeGroupChatReadStates(updatedRoomDoc?.readStates, roomMemberUserIds).find((item) => {
    return item.userId === safeUserId;
  });
  if (readState) {
    await broadcastGroupChatRoomReadStateUpdated(safeRoomId, readState);
  }
  return updatedRoomDoc;
}

function isMongoObjectIdLike(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function initGroupChatWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: GROUP_CHAT_WS_PATH,
    maxPayload: GROUP_CHAT_WS_MAX_PAYLOAD_BYTES,
  });

  wss.on("connection", (socket) => {
    const meta = {
      authed: false,
      userId: "",
      userName: "",
      joinedRooms: new Set(),
      authTimer: 0,
    };
    groupChatWsMetaBySocket.set(socket, meta);

    meta.authTimer = setTimeout(() => {
      sendGroupChatWsError(socket, "连接超时，请先完成鉴权。", "auth_timeout");
      closeGroupChatSocket(socket, 4001, "auth_timeout");
    }, GROUP_CHAT_WS_AUTH_TIMEOUT_MS);

    socket.on("message", (rawData) => {
      void handleGroupChatWsMessage(socket, rawData);
    });

    socket.on("close", () => {
      const currentMeta = groupChatWsMetaBySocket.get(socket);
      if (currentMeta?.authTimer) {
        clearTimeout(currentMeta.authTimer);
      }
      detachSocketFromAllGroupChatRooms(socket);
      groupChatWsMetaBySocket.delete(socket);
    });
  });

  return wss;
}

async function handleGroupChatWsMessage(socket, rawData) {
  const payload = readGroupChatWsPayload(rawData);
  if (!payload) {
    sendGroupChatWsError(socket, "消息格式错误，必须为 JSON。", "bad_payload");
    return;
  }

  const type = sanitizeText(payload.type, "", 40).toLowerCase();
  if (!type) {
    sendGroupChatWsError(socket, "缺少消息类型。", "missing_type");
    return;
  }

  try {
    if (type === "auth") {
      await handleGroupChatWsAuth(socket, payload);
      return;
    }
    if (type === "join_room") {
      await handleGroupChatWsJoinRoom(socket, payload);
      return;
    }
    if (type === "leave_room") {
      handleGroupChatWsLeaveRoom(socket, payload);
      return;
    }
    if (type === "ping") {
      sendGroupChatWsPayload(socket, {
        type: "pong",
        at: sanitizeIsoDate(payload?.at) || new Date().toISOString(),
      });
      return;
    }
    sendGroupChatWsError(socket, "不支持的消息类型。", "unsupported_type");
  } catch (error) {
    sendGroupChatWsError(
      socket,
      error?.message || "WebSocket 处理失败，请稍后重试。",
      "ws_internal_error",
    );
  }
}

async function handleGroupChatWsAuth(socket, payload) {
  const meta = groupChatWsMetaBySocket.get(socket);
  if (!meta) return;

  const token = String(payload?.token || "").trim();
  const verified = verifyToken(token);
  if (!verified || verified.scope !== "chat" || !verified.uid) {
    sendGroupChatWsError(socket, "登录状态无效或已过期，请重新登录。", "unauthorized");
    closeGroupChatSocket(socket, 4003, "unauthorized");
    return;
  }

  const user = await AuthUser.findById(verified.uid).lean();
  if (!user) {
    sendGroupChatWsError(socket, "账号不存在，请重新登录。", "account_not_found");
    closeGroupChatSocket(socket, 4003, "account_not_found");
    return;
  }

  meta.authed = true;
  meta.userId = sanitizeId(user?._id, "");
  meta.userName = buildGroupChatDisplayName(user);
  if (meta.authTimer) {
    clearTimeout(meta.authTimer);
    meta.authTimer = 0;
  }

  sendGroupChatWsPayload(socket, {
    type: "authed",
    user: {
      id: meta.userId,
      name: meta.userName,
    },
  });
}

async function handleGroupChatWsJoinRoom(socket, payload) {
  const meta = groupChatWsMetaBySocket.get(socket);
  if (!meta?.authed || !meta.userId) {
    sendGroupChatWsError(socket, "尚未鉴权，无法加入群聊订阅。", "not_authed");
    return;
  }

  const roomId = sanitizeId(payload?.roomId, "");
  if (!roomId || !isMongoObjectIdLike(roomId)) {
    sendGroupChatWsError(socket, "无效群聊 ID。", "invalid_room_id");
    return;
  }

  const hasMembership = await GroupChatRoom.exists({
    _id: roomId,
    memberUserIds: meta.userId,
  });
  if (!hasMembership) {
    sendGroupChatWsError(socket, "你不在该群聊中，无法订阅消息。", "forbidden_room");
    return;
  }

  attachSocketToGroupChatRoom(socket, roomId);
  sendGroupChatWsPayload(socket, {
    type: "joined",
    roomId,
  });
  sendGroupChatWsPayload(socket, {
    type: "member_presence_updated",
    roomId,
    onlineUserIds: getGroupChatOnlineUserIdsByRoom(roomId),
  });
}

function handleGroupChatWsLeaveRoom(socket, payload) {
  const roomId = sanitizeId(payload?.roomId, "");
  if (!roomId) return;
  detachSocketFromGroupChatRoom(socket, roomId);
}

function readGroupChatWsPayload(rawData) {
  let text = "";
  if (typeof rawData === "string") {
    text = rawData;
  } else if (Buffer.isBuffer(rawData)) {
    text = rawData.toString("utf8");
  } else if (rawData instanceof ArrayBuffer) {
    text = Buffer.from(rawData).toString("utf8");
  } else if (Array.isArray(rawData)) {
    try {
      const chunks = rawData.map((chunk) =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      );
      text = Buffer.concat(chunks).toString("utf8");
    } catch {
      text = "";
    }
  }
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sendGroupChatWsPayload(socket, payload) {
  if (!socket || socket.readyState !== 1) return false;
  try {
    socket.send(JSON.stringify(payload || {}));
    return true;
  } catch {
    return false;
  }
}

function sendGroupChatWsError(socket, message, code = "ws_error") {
  sendGroupChatWsPayload(socket, {
    type: "error",
    code: sanitizeText(code, "ws_error", 60),
    message: sanitizeText(message, "WebSocket 错误。", 240),
  });
}

function closeGroupChatSocket(socket, code = 1008, reason = "") {
  if (!socket || socket.readyState === 3) return;
  try {
    socket.close(code, sanitizeText(reason, "", 120));
  } catch {
    // ignore close failures
  }
}

function attachSocketToGroupChatRoom(socket, roomId) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;
  const meta = groupChatWsMetaBySocket.get(socket);
  if (!meta) return;
  if (meta.joinedRooms.has(safeRoomId)) return;

  let sockets = groupChatWsRoomSockets.get(safeRoomId);
  if (!sockets) {
    sockets = new Set();
    groupChatWsRoomSockets.set(safeRoomId, sockets);
  }
  sockets.add(socket);
  meta.joinedRooms.add(safeRoomId);

  if (meta.userId) {
    let roomOnlineCounter = groupChatWsOnlineCountsByRoom.get(safeRoomId);
    if (!roomOnlineCounter) {
      roomOnlineCounter = new Map();
      groupChatWsOnlineCountsByRoom.set(safeRoomId, roomOnlineCounter);
    }
    const previousCount = sanitizeRuntimeInteger(roomOnlineCounter.get(meta.userId), 0, 0, 9999);
    roomOnlineCounter.set(meta.userId, previousCount + 1);
    if (previousCount === 0) {
      broadcastGroupChatMemberPresenceUpdated(safeRoomId);
    }
  }
}

function detachSocketFromGroupChatRoom(socket, roomId) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;
  const meta = groupChatWsMetaBySocket.get(socket);
  if (!meta?.joinedRooms?.has(safeRoomId)) return;

  const sockets = groupChatWsRoomSockets.get(safeRoomId);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      groupChatWsRoomSockets.delete(safeRoomId);
    }
  }

  meta.joinedRooms.delete(safeRoomId);
  if (!meta.userId) return;

  const roomOnlineCounter = groupChatWsOnlineCountsByRoom.get(safeRoomId);
  if (!roomOnlineCounter) return;
  const previousCount = sanitizeRuntimeInteger(roomOnlineCounter.get(meta.userId), 0, 0, 9999);
  const nextCount = Math.max(0, previousCount - 1);
  if (nextCount <= 0) {
    roomOnlineCounter.delete(meta.userId);
    if (roomOnlineCounter.size === 0) {
      groupChatWsOnlineCountsByRoom.delete(safeRoomId);
    }
    broadcastGroupChatMemberPresenceUpdated(safeRoomId);
    return;
  }
  roomOnlineCounter.set(meta.userId, nextCount);
}

function detachSocketFromAllGroupChatRooms(socket) {
  const meta = groupChatWsMetaBySocket.get(socket);
  if (!meta) {
    Array.from(groupChatWsRoomSockets.entries()).forEach(([roomId, sockets]) => {
      sockets.delete(socket);
      if (sockets.size === 0) {
        groupChatWsRoomSockets.delete(roomId);
      }
    });
    return;
  }

  const joinedRoomIds = Array.from(meta.joinedRooms);
  joinedRoomIds.forEach((roomId) => detachSocketFromGroupChatRoom(socket, roomId));
}

function clearGroupChatRoomSockets(roomId) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;
  const sockets = groupChatWsRoomSockets.get(safeRoomId);
  if (!sockets) return;
  Array.from(sockets).forEach((socket) => {
    const meta = groupChatWsMetaBySocket.get(socket);
    if (meta) {
      meta.joinedRooms.delete(safeRoomId);
    }
  });
  groupChatWsRoomSockets.delete(safeRoomId);
  groupChatWsOnlineCountsByRoom.delete(safeRoomId);
}

function broadcastGroupChatWsPayload(roomId, payload) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;

  const sockets = groupChatWsRoomSockets.get(safeRoomId);
  if (!sockets || sockets.size === 0) return;

  const data = JSON.stringify(payload || {});
  Array.from(sockets).forEach((socket) => {
    if (!socket || socket.readyState !== 1) {
      detachSocketFromGroupChatRoom(socket, safeRoomId);
      return;
    }
    try {
      socket.send(data);
    } catch {
      detachSocketFromGroupChatRoom(socket, safeRoomId);
    }
  });
}

function sendGroupChatWsPayloadToUserInRoom(roomId, userId, payload) {
  const safeRoomId = sanitizeId(roomId, "");
  const safeUserId = sanitizeId(userId, "");
  if (!safeRoomId || !safeUserId) return;
  const sockets = groupChatWsRoomSockets.get(safeRoomId);
  if (!sockets || sockets.size === 0) return;
  const data = JSON.stringify(payload || {});
  Array.from(sockets).forEach((socket) => {
    if (!socket || socket.readyState !== 1) {
      detachSocketFromGroupChatRoom(socket, safeRoomId);
      return;
    }
    const meta = groupChatWsMetaBySocket.get(socket);
    if (!meta?.authed || meta.userId !== safeUserId) return;
    try {
      socket.send(data);
    } catch {
      detachSocketFromGroupChatRoom(socket, safeRoomId);
    }
  });
}

function broadcastGroupChatMemberPresenceUpdated(roomId) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;
  broadcastGroupChatWsPayload(safeRoomId, {
    type: "member_presence_updated",
    roomId: safeRoomId,
    onlineUserIds: getGroupChatOnlineUserIdsByRoom(safeRoomId),
  });
}

async function broadcastGroupChatRoomReadStateUpdated(roomId, readState) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;
  const normalizedReadStates = normalizeGroupChatReadStates([readState], [sanitizeId(readState?.userId, "")]);
  const normalizedReadState = normalizedReadStates[0];
  if (!normalizedReadState) return;
  const room = await GroupChatRoom.findById(safeRoomId, { ownerUserId: 1 }).lean();
  const ownerUserId = sanitizeId(room?.ownerUserId, "");
  if (!ownerUserId) return;
  sendGroupChatWsPayloadToUserInRoom(safeRoomId, ownerUserId, {
    type: "room_read_state_updated",
    roomId: safeRoomId,
    readState: normalizedReadState,
  });
}

function broadcastGroupChatMessageCreated(roomId, message) {
  const rawMessage =
    message && typeof message === "object" && message.id
      ? { ...message, _id: message.id }
      : message;
  const normalizedMessage = normalizeGroupChatMessageDoc(rawMessage);
  if (!normalizedMessage) return;
  broadcastGroupChatWsPayload(roomId, {
    type: "message_created",
    roomId: sanitizeId(roomId, normalizedMessage.roomId),
    message: normalizedMessage,
  });
}

function broadcastGroupChatMessageReactionsUpdated(roomId, message) {
  const rawMessage =
    message && typeof message === "object" && message.id
      ? { ...message, _id: message.id }
      : message;
  const normalizedMessage = normalizeGroupChatMessageDoc(rawMessage);
  if (!normalizedMessage) return;
  broadcastGroupChatWsPayload(roomId, {
    type: "message_reactions_updated",
    roomId: sanitizeId(roomId, normalizedMessage.roomId),
    messageId: normalizedMessage.id,
    reactions: normalizedMessage.reactions,
  });
}

function broadcastGroupChatMessageDeleted(roomId, messageId) {
  const safeRoomId = sanitizeId(roomId, "");
  const safeMessageId = sanitizeId(messageId, "");
  if (!safeRoomId || !safeMessageId) return;
  broadcastGroupChatWsPayload(safeRoomId, {
    type: "message_deleted",
    roomId: safeRoomId,
    messageId: safeMessageId,
  });
}

function broadcastGroupChatRoomUpdated(roomId, room) {
  const rawRoom = room && typeof room === "object" && room.id ? { ...room, _id: room.id } : room;
  const normalizedRoom = normalizeGroupChatRoomDoc(rawRoom);
  if (!normalizedRoom) return;
  broadcastGroupChatWsPayload(roomId, {
    type: "room_updated",
    roomId: sanitizeId(roomId, normalizedRoom.id),
    room: normalizedRoom,
  });
}

function broadcastGroupChatRoomDissolved(roomId, byUser) {
  const safeRoomId = sanitizeId(roomId, "");
  if (!safeRoomId) return;
  broadcastGroupChatWsPayload(safeRoomId, {
    type: "room_dissolved",
    roomId: safeRoomId,
    byUser: {
      id: sanitizeId(byUser?.id || byUser?._id, ""),
      name: sanitizeText(byUser?.name || byUser?.username, "用户", 30),
    },
  });
}

function broadcastGroupChatMemberJoined(roomId, user) {
  const userId = sanitizeId(user?.id || user?._id, "");
  const userName = sanitizeText(user?.name || user?.username, "用户", 30);
  if (!userId) return;
  broadcastGroupChatWsPayload(roomId, {
    type: "member_joined",
    roomId: sanitizeId(roomId, ""),
    user: {
      id: userId,
      name: userName,
    },
  });
}

async function startServer() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 6000 });
  console.log(`Mongo connected: ${mongoUri}`);

  const server = http.createServer(app);
  initGroupChatWebSocketServer(server);

  server.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
    console.log(`Group chat websocket listening on ws://localhost:${port}${GROUP_CHAT_WS_PATH}`);
  });

  void runStartupMaintenanceTasks();
}

async function runStartupMaintenanceTasks() {
  await ensureUploadedFileContextIndexes().catch((error) => {
    console.warn(
      "Failed to ensure uploaded file context indexes:",
      error?.message || error,
    );
  });
  await ensureGeneratedImageHistoryIndexes().catch((error) => {
    console.warn(
      "Failed to ensure generated image history indexes:",
      error?.message || error,
    );
  });
  await ensureGroupChatStoredFileIndexes().catch((error) => {
    console.warn(
      "Failed to ensure group chat file indexes:",
      error?.message || error,
    );
  });
  await runGroupChatOssStartupHealthCheck().catch((error) => {
    console.warn(
      "Failed to run group chat OSS startup health check:",
      error?.message || error,
    );
  });
  await migrateOssFilesToPermanentRetention();
  await cleanupExpiredGroupChatStoredFiles().catch((error) => {
    console.warn(
      "Failed to cleanup expired group chat OSS files on startup:",
      error?.message || error,
    );
  });
  await cleanupExpiredGeneratedImageHistories().catch((error) => {
    console.warn(
      "Failed to cleanup expired generated image OSS files on startup:",
      error?.message || error,
    );
  });
  startGroupChatExpiredFileCleanupTask();
  startGeneratedImageExpiredCleanupTask();
}

async function ensureUploadedFileContextIndexes() {
  const collection = UploadedFileContext.collection;
  let existingIndexes = await readCollectionIndexesSafe(collection);

  const needUniqueIndex = !hasEquivalentMongoIndex(existingIndexes, {
    key: { userId: 1, sessionId: 1, messageId: 1 },
    unique: true,
  });
  if (needUniqueIndex) {
    await collection.createIndex(
      { userId: 1, sessionId: 1, messageId: 1 },
      {
        unique: true,
        name: "ux_uploaded_file_context_user_session_message",
      },
    );
    existingIndexes = await readCollectionIndexesSafe(collection);
  }

  await ensureUploadedFileContextTtlIndex(collection, existingIndexes);
}

async function ensureGeneratedImageHistoryIndexes() {
  const collection = GeneratedImageHistory.collection;
  let existingIndexes = await readCollectionIndexesSafe(collection);

  const needUserCreatedAtIndex = !hasEquivalentMongoIndex(existingIndexes, {
    key: { userId: 1, createdAt: -1 },
  });
  if (needUserCreatedAtIndex) {
    await collection.createIndex(
      { userId: 1, createdAt: -1 },
      { name: "ix_generated_image_histories_user_created_at_desc" },
    );
    existingIndexes = await readCollectionIndexesSafe(collection);
  }

  await ensureGeneratedImageHistoryTtlIndex(collection, existingIndexes);
}

async function ensureGroupChatStoredFileIndexes() {
  const collection = GroupChatStoredFile.collection;
  let existingIndexes = await readCollectionIndexesSafe(collection);

  const needRoomCreatedAtIndex = !hasEquivalentMongoIndex(existingIndexes, {
    key: { roomId: 1, createdAt: -1 },
  });
  if (needRoomCreatedAtIndex) {
    await collection.createIndex(
      { roomId: 1, createdAt: -1 },
      { name: "ix_group_chat_files_room_created_desc" },
    );
    existingIndexes = await readCollectionIndexesSafe(collection);
  }

  await ensureGroupChatStoredFileTtlIndex(collection, existingIndexes);
}

function hasEquivalentMongoIndex(existingIndexes, { key, unique, expireAfterSeconds }) {
  const list = Array.isArray(existingIndexes) ? existingIndexes : [];
  return list.some((index) => {
    if (!hasSameMongoIndexKey(index?.key, key)) return false;

    if (unique !== undefined) {
      if (!!index?.unique !== !!unique) return false;
    }

    if (expireAfterSeconds !== undefined) {
      const currentExpire = Number(index?.expireAfterSeconds);
      if (!Number.isFinite(currentExpire)) return false;
      if (currentExpire !== Number(expireAfterSeconds)) return false;
    }

    return true;
  });
}

function hasSameMongoIndexKey(a, b) {
  const aEntries = Object.entries(a || {});
  const bEntries = Object.entries(b || {});
  if (aEntries.length !== bEntries.length) return false;
  for (let i = 0; i < aEntries.length; i += 1) {
    const [aKey, aValue] = aEntries[i];
    const [bKey, bValue] = bEntries[i] || [];
    if (aKey !== bKey) return false;
    if (Number(aValue) !== Number(bValue)) return false;
  }
  return true;
}

async function readCollectionIndexesSafe(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (isMongoNamespaceMissingError(error)) {
      return [];
    }
    throw error;
  }
}

function isMongoNamespaceMissingError(error) {
  if (Number(error?.code) === 26) return true;
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  if (!message) return false;
  return message.includes("ns does not exist") || message.includes("namespace not found");
}

async function ensureUploadedFileContextTtlIndex(collection, existingIndexes) {
  const ttlSpec = { key: { expiresAt: 1 }, expireAfterSeconds: 0 };
  if (hasEquivalentMongoIndex(existingIndexes, ttlSpec)) {
    return;
  }

  const sameKeyIndex = findMongoIndexByKey(existingIndexes, ttlSpec.key);
  if (sameKeyIndex?.name) {
    try {
      await collection.db.command({
        collMod: collection.collectionName,
        index: {
          name: sameKeyIndex.name,
          expireAfterSeconds: 0,
        },
      });
      return;
    } catch (error) {
      // 某些 Mongo 版本不支持把普通索引直接转成 TTL，降级为删旧建新。
      if (String(sameKeyIndex.name) !== "_id_") {
        await collection.dropIndex(sameKeyIndex.name);
      }
    }
  }

  await collection.createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      name: "ttl_uploaded_file_context_expires_at",
    },
  );
}

async function ensureGeneratedImageHistoryTtlIndex(collection, existingIndexes) {
  const ttlSpec = { key: { expiresAt: 1 }, expireAfterSeconds: 0 };
  if (hasEquivalentMongoIndex(existingIndexes, ttlSpec)) {
    return;
  }

  const sameKeyIndex = findMongoIndexByKey(existingIndexes, ttlSpec.key);
  if (sameKeyIndex?.name) {
    try {
      await collection.db.command({
        collMod: collection.collectionName,
        index: {
          name: sameKeyIndex.name,
          expireAfterSeconds: 0,
        },
      });
      return;
    } catch (error) {
      if (String(sameKeyIndex.name) !== "_id_") {
        await collection.dropIndex(sameKeyIndex.name);
      }
    }
  }

  await collection.createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      name: "ttl_generated_image_histories_expires_at",
    },
  );
}

async function ensureGroupChatStoredFileTtlIndex(collection, existingIndexes) {
  const ttlSpec = { key: { expiresAt: 1 }, expireAfterSeconds: 0 };
  if (hasEquivalentMongoIndex(existingIndexes, ttlSpec)) {
    return;
  }

  const sameKeyIndex = findMongoIndexByKey(existingIndexes, ttlSpec.key);
  if (sameKeyIndex?.name) {
    try {
      await collection.db.command({
        collMod: collection.collectionName,
        index: {
          name: sameKeyIndex.name,
          expireAfterSeconds: 0,
        },
      });
      return;
    } catch (error) {
      if (String(sameKeyIndex.name) !== "_id_") {
        await collection.dropIndex(sameKeyIndex.name);
      }
    }
  }

  await collection.createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      name: "ttl_group_chat_files_expires_at",
    },
  );
}

function findMongoIndexByKey(existingIndexes, key) {
  const list = Array.isArray(existingIndexes) ? existingIndexes : [];
  return list.find((index) => hasSameMongoIndexKey(index?.key, key)) || null;
}

function normalizeUsername(input) {
  const name = String(input || "").trim();
  if (!name) return "";
  if (name.length < 2 || name.length > 64) return "";
  if (/\s/.test(name)) return "";
  return name;
}

function toUsernameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function validatePassword(password) {
  const value = String(password || "");
  if (!value) return "请输入密码。";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `密码至少 ${PASSWORD_MIN_LENGTH} 位。`;
  }
  if (value.length > 128) {
    return "密码长度不能超过 128 位。";
  }
  return "";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, hashHex] = String(storedHash || "").split(":");
  if (!salt || !hashHex) return false;

  const derived = await scryptAsync(password, salt, 64);
  const a = Buffer.from(hashHex, "hex");
  const b = Buffer.from(derived);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signToken(payload, ttlSeconds) {
  const now = Date.now();
  const safeTtl = Number.isFinite(ttlSeconds) ? ttlSeconds : AUTH_TOKEN_TTL_SECONDS;
  const data = {
    ...payload,
    iat: now,
    exp: now + safeTtl * 1000,
  };
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", authSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", authSecret)
    .update(body)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

async function authenticateAdminRequest(req, res) {
  const token = readBearerToken(req);
  const payload = verifyToken(token);
  if (!payload || payload.scope !== "admin" || payload.role !== "admin") {
    res.status(401).json({ error: "管理员身份无效或已过期。" });
    return null;
  }

  const admin = await AuthUser.findById(payload.uid).lean();
  if (!admin || admin.role !== "admin" || admin.usernameKey !== "admin") {
    res.status(403).json({ error: "仅管理员可访问。" });
    return null;
  }
  return admin;
}

function buildAdminUsersExportTxt(users) {
  const lines = [
    "EduChat 管理员导出：账号密码数据",
    `导出时间: ${formatDisplayTime(new Date())}`,
    `总用户数: ${users.length}`,
    "",
  ];

  users.forEach((item, idx) => {
    lines.push(`用户 ${idx + 1}`);
    lines.push(`账号: ${item.username || "-"}`);
    lines.push(`密码: ${item.passwordPlain || "-"}`);
    lines.push(`角色: ${item.role || "user"}`);
    lines.push(`注册时间: ${formatDisplayTime(item.createdAt)}`);
    lines.push(`更新时间: ${formatDisplayTime(item.updatedAt)}`);
    lines.push("");
  });
  return lines.join("\n");
}

function buildAdminChatsExportTxt(users, stateByUserId) {
  const exportedAt = new Date();
  const lines = [
    "EduChat 管理员导出：全量聊天数据",
    `导出时间: ${formatDisplayTime(exportedAt)}`,
    `总用户数: ${users.length}`,
    "",
  ];

  users.forEach((user, userIndex) => {
    const userId = String(user?._id || "");
    const state = stateByUserId.get(userId);
    appendUserChatSection(lines, user, state, userIndex + 1);
    lines.push("");
  });

  return lines.join("\n");
}

function buildSingleUserChatExportTxt(user, state, userIndex = 1, exportedAt = new Date()) {
  const lines = [
    "EduChat 用户聊天数据",
    `导出时间: ${formatDisplayTime(exportedAt)}`,
    "",
  ];
  appendUserChatSection(lines, user, state, userIndex);
  return lines.join("\n");
}

function appendUserChatSection(lines, user, state, userIndex = 1) {
  const userId = String(user?._id || "");
  const profile = sanitizeUserProfile(user?.profile);
  const groups = Array.isArray(state?.groups) ? state.groups : [];
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  const sessionMessages =
    state?.sessionMessages && typeof state.sessionMessages === "object"
      ? state.sessionMessages
      : {};
  const groupNameById = new Map(groups.map((group) => [group.id, group.name || group.id]));

  lines.push(`用户 ${userIndex}`);
  lines.push(`账号: ${user?.username || "-"}`);
  lines.push(`角色: ${user?.role || "user"}`);
  lines.push(`用户ID: ${userId || "-"}`);
  lines.push(`注册时间: ${formatDisplayTime(user?.createdAt)}`);
  lines.push(`更新时间: ${formatDisplayTime(user?.updatedAt)}`);
  lines.push("个人信息:");
  lines.push(`  姓名: ${profile.name || "-"}`);
  lines.push(`  学号: ${profile.studentId || "-"}`);
  lines.push(`  性别: ${profile.gender || "-"}`);
  lines.push(`  年级: ${profile.grade || "-"}`);
  lines.push(`  班级: ${profile.className || "-"}`);

  if (!state) {
    lines.push("聊天数据: 暂无");
    return;
  }

  lines.push(`当前激活会话ID: ${state.activeId || "-"}`);
  lines.push(
    `当前设置: agent=${state.settings?.agent || "-"}, temperature=${formatMaybeNumber(state.settings?.apiTemperature)}, topP=${formatMaybeNumber(state.settings?.apiTopP)}, thinkingMode=${state.settings?.apiReasoningEffort || "-"}, lastAppliedReasoning=${state.settings?.lastAppliedReasoning || "-"}`,
  );
  lines.push(`分组数: ${groups.length}`);
  if (groups.length > 0) {
    groups.forEach((group, idx) => {
      lines.push(`  ${idx + 1}. ${group.name || "未命名分组"} (ID: ${group.id || "-"})`);
      if (group.description) {
        lines.push(`     描述: ${group.description}`);
      }
    });
  } else {
    lines.push("  （无分组）");
  }

  lines.push(`会话数: ${sessions.length}`);
  if (sessions.length === 0) {
    lines.push("  （无会话）");
    return;
  }

  sessions.forEach((session, sessionIndex) => {
    const groupName = session.groupId
      ? groupNameById.get(session.groupId) || session.groupId
      : "未分组";
    const msgs = Array.isArray(sessionMessages[session.id]) ? sessionMessages[session.id] : [];

    lines.push(
      `  会话 ${sessionIndex + 1}: ${session.title || "新对话"} (ID: ${session.id || "-"})`,
    );
    lines.push(`    分组: ${groupName}`);
    lines.push(`    置顶: ${session.pinned ? "是" : "否"}`);
    lines.push(`    消息数: ${msgs.length}`);

    if (msgs.length === 0) {
      lines.push("    （暂无消息）");
      lines.push("");
      return;
    }

    msgs.forEach((msg, msgIndex) => {
      const role = normalizeExportRole(msg?.role);
      lines.push(`    消息 ${msgIndex + 1} (${role})`);

      if (msg?.askedAt) lines.push(`      askedAt: ${formatDisplayTime(msg.askedAt)}`);
      if (msg?.startedAt) lines.push(`      startedAt: ${formatDisplayTime(msg.startedAt)}`);
      if (msg?.firstTextAt)
        lines.push(`      firstTextAt: ${formatDisplayTime(msg.firstTextAt)}`);
      if (msg?.regenerateOf) lines.push(`      regenerateOf: ${msg.regenerateOf}`);

      if (Array.isArray(msg?.attachments) && msg.attachments.length > 0) {
        lines.push("      附件:");
        msg.attachments.forEach((attachment, attachIndex) => {
          const size = Number.isFinite(Number(attachment?.size))
            ? `${Number(attachment.size)}B`
            : "-";
          lines.push(
            `        ${attachIndex + 1}. ${attachment?.name || "文件"} | type=${attachment?.type || "-"} | size=${size}`,
          );
        });
      }

      if (role === "assistant") {
        const runtime = msg?.runtime && typeof msg.runtime === "object" ? msg.runtime : {};
        lines.push("      运行参数:");
        lines.push(`        智能体: ${runtime.agentName || "-"} (${runtime.agentId || "-"})`);
        lines.push(`        模型: ${runtime.model || "-"}`);
        lines.push(`        服务商: ${runtime.provider || "-"}`);
        lines.push(`        temperature: ${formatMaybeNumber(runtime.temperature)}`);
        lines.push(`        topP: ${formatMaybeNumber(runtime.topP)}`);
        lines.push(`        reasoningRequested: ${runtime.reasoningRequested || "-"}`);
        lines.push(`        reasoningApplied: ${runtime.reasoningApplied || "-"}`);
        lines.push(`      用户反馈: ${normalizeFeedbackLabel(msg?.feedback)}`);
      }

      if (msg?.reasoning) {
        lines.push("      思路:");
        appendIndentedBlock(lines, msg.reasoning, 8);
      }

      lines.push("      内容:");
      appendIndentedBlock(lines, msg?.content || "", 8);
      lines.push("");
    });
  });
}

function appendIndentedBlock(lines, text, spaces = 6) {
  const indent = " ".repeat(spaces);
  const source = String(text || "");
  if (!source.trim()) {
    lines.push(`${indent}-`);
    return;
  }
  source.replace(/\r/g, "").split("\n").forEach((line) => {
    lines.push(`${indent}${line}`);
  });
}

function formatDisplayTime(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("zh-CN", { hour12: false });
}

function formatSystemDateYmd(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "未知日期";
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  return `${y}年${m}月${d}日`;
}

function formatFileStamp(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "unknown-time";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}-${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`;
}

function normalizeExportRole(role) {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "system") return "system";
  return "unknown";
}

function normalizeFeedbackLabel(feedback) {
  if (feedback === "up") return "点赞";
  if (feedback === "down") return "点踩";
  return "无";
}

function formatMaybeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return String(n);
}

function buildZipReadme(fileCount, exportedAt) {
  return [
    "EduChat 管理员导出：按用户分文件聊天数据 ZIP",
    `导出时间: ${formatDisplayTime(exportedAt)}`,
    `文件数量: ${fileCount}`,
    "",
    "说明:",
    "1. 每个 TXT 文件对应一个用户。",
    "2. 文件结构与管理员聊天 TXT 导出一致，包含用户信息、分组、会话、消息、模型参数与反馈。",
    "3. 如需二次分析，可直接按行解析 TXT 或导入脚本处理。",
    "",
  ].join("\n");
}

function sanitizeZipFileNamePart(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.+/g, ".");
  return (raw || "user").slice(0, 64);
}

function buildZipBuffer(files) {
  const safeFiles = Array.isArray(files) ? files.slice(0, 2000) : [];
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const now = new Date();
  const dos = toDosDateTime(now);

  safeFiles.forEach((item, index) => {
    const fallbackName = `file-${index + 1}.txt`;
    const safeName = sanitizeZipEntryName(item?.name || fallbackName, fallbackName);
    const dataBuffer =
      item?.content instanceof Buffer
        ? item.content
        : Buffer.from(String(item?.content ?? ""), "utf8");
    const fileNameBuffer = Buffer.from(safeName, "utf8");
    const crc = crc32Buffer(dataBuffer);
    const size = dataBuffer.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename
    localHeader.writeUInt16LE(0, 8); // store
    localHeader.writeUInt16LE(dos.time, 10);
    localHeader.writeUInt16LE(dos.date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileNameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dos.time, 12);
    centralHeader.writeUInt16LE(dos.date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileNameBuffer);

    localOffset += 30 + fileNameBuffer.length + size;
  });

  const centralDirOffset = localOffset;
  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const totalEntries = Math.min(safeFiles.length, 0xffff);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(totalEntries, 8);
  eocd.writeUInt16LE(totalEntries, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function sanitizeZipEntryName(rawName, fallback = "file.txt") {
  const normalized = String(rawName || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/[<>:"|?*]/g, "_")
        .trim()
        .slice(0, 80),
    )
    .filter(Boolean)
    .join("/");

  if (!normalized) return fallback;
  return normalized.slice(0, 240);
}

function toDosDateTime(date) {
  const dt = date instanceof Date ? date : new Date(date);
  const year = Math.min(2107, Math.max(1980, dt.getFullYear()));
  const month = Math.min(12, Math.max(1, dt.getMonth() + 1));
  const day = Math.min(31, Math.max(1, dt.getDate()));
  const hours = Math.min(23, Math.max(0, dt.getHours()));
  const minutes = Math.min(59, Math.max(0, dt.getMinutes()));
  const seconds = Math.min(59, Math.max(0, dt.getSeconds()));
  const dosTime = (hours << 11) | (minutes << 5) | Math.floor(seconds / 2);
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { time: dosTime, date: dosDate };
}

function crc32Buffer(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function toPublicUser(user) {
  return {
    id: String(user?._id || ""),
    username: String(user?.username || ""),
    role: String(user?.role || "user"),
  };
}
