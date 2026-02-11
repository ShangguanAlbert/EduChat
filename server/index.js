import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
import mammoth from "mammoth";
import XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import mongoose from "mongoose";
import { SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT } from "./prompts/leakProtectionPrompt.js";
import { PROMPT_LEAK_PROBE_KEYWORDS } from "./prompts/leakProtectionKeywords.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 8787;
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/educhat";
const authSecret = String(
  process.env.AUTH_SECRET || "educhat-dev-secret-change-this-secret",
).trim();
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 - 1; // strictly < 10MB
const MAX_FILES = 8;
const MAX_IMAGE_GENERATION_INPUT_FILES = 14;
const MAX_PARSED_CHARS_PER_FILE = 12000;
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
const RUNTIME_MAX_OUTPUT_TOKENS = 128000;
const RUNTIME_MAX_REASONING_TOKENS = 128000;
const UPLOADED_FILE_CONTEXT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
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
  D: Object.freeze({}),
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
          apiTemperature: { type: Number, default: 0.6 },
          apiTopP: { type: Number, default: 1 },
          apiReasoningEffort: { type: String, default: "high" },
          lastAppliedReasoning: { type: String, default: "high" },
          smartContextEnabled: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: () => ({
        agent: "A",
        apiTemperature: 0.6,
        apiTopP: 1,
        apiReasoningEffort: "high",
        lastAppliedReasoning: "high",
        smartContextEnabled: false,
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
  const encodedName = encodeURIComponent(fileName);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodedName}`,
  );
  res.send(zipBuffer);
});

app.delete("/api/auth/admin/chats", async (req, res) => {
  if (!(await authenticateAdminRequest(req, res))) return;

  const [chatStateResult, uploadedContextResult] = await Promise.all([
    ChatState.deleteMany({}),
    UploadedFileContext.deleteMany({}),
  ]);
  res.json({
    ok: true,
    deletedCount: Number(chatStateResult?.deletedCount || 0),
    deletedUploadedFileContextCount: Number(uploadedContextResult?.deletedCount || 0),
  });
});

app.post(
  "/api/auth/admin/agent-debug-stream",
  requireAdminAuth,
  upload.array("files", MAX_FILES),
  async (req, res) => {
    const agentId = sanitizeAgent(req.body?.agentId || "A");
    const messages = readRequestMessages(req.body?.messages);
    const runtimeConfig = sanitizeSingleAgentRuntimeConfig(
      readJsonLikeField(req.body?.runtimeConfig, {}),
      agentId,
    );
    const files = Array.isArray(req.files) ? req.files : [];

    await streamAgentResponse({
      res,
      agentId,
      messages,
      files,
      runtimeConfig,
      attachUploadedFiles: files.length > 0,
    });
  },
);

app.post(
  "/api/chat/volcengine-files/upload",
  requireChatAuth,
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
      const uploaded = [];
      for (const file of files) {
        const normalizedOriginalName = normalizeMultipartFileName(file.originalname);
        const normalizedFile =
          normalizedOriginalName && normalizedOriginalName !== file.originalname
            ? { ...file, originalname: normalizedOriginalName }
            : file;

        const inputType = classifyVolcengineFileInputType(normalizedFile);
        if (!inputType) {
          res.status(400).json({
            error: `文件类型不支持 Files API 上传：${normalizedFile.originalname || "未命名文件"}`,
          });
          return;
        }

        const result = await uploadVolcengineFileAndWaitActive({
          file: normalizedFile,
          inputType,
          model,
          filesEndpoint: providerConfig.filesEndpoint,
          apiKey: providerConfig.apiKey,
        });

        uploaded.push({
          fileId: result.fileId,
          inputType,
          name: String(normalizedFile.originalname || ""),
          mimeType: String(normalizedFile.mimetype || ""),
          size: Number(normalizedFile.size || 0),
        });
      }

      res.json({
        ok: true,
        files: uploaded,
      });
    } catch (error) {
      res.status(500).json({
        error: error?.message || "火山文件上传失败，请稍后重试。",
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
    });
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
      res.status(413).json({ error: "文件过大，单个文件必须小于 10MB。" });
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
    const imageUrl = extractInputImageUrl(part);
    if (imageUrl) {
      return { type: "image_url", image_url: { url: imageUrl } };
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

async function saveUploadedFileContext({ userId, sessionId, messageId, content }) {
  const identity = resolveUploadedFileContextIdentity({
    userId,
    sessionId,
    messageId,
  });
  if (!identity) return;
  const normalized = normalizeMessageContent(content);
  if (!hasUsableMessageContent(normalized)) return;
  const clonedContent = cloneNormalizedMessageContent(normalized);

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

async function rehydrateUploadedFileContexts(messages, { userId, sessionId }) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const safeUserId = sanitizeId(userId, "");
  const safeSessionId = sanitizeId(sessionId, "");
  if (!safeUserId || !safeSessionId) return;

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
      { messageId: 1, content: 1 },
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
  docs.forEach((doc) => {
    const messageId = sanitizeId(doc?.messageId, "");
    if (!messageId) return;
    const normalized = normalizeMessageContent(doc?.content);
    if (!hasUsableMessageContent(normalized)) return;
    contentByMessageId.set(messageId, cloneNormalizedMessageContent(normalized));
  });
  if (contentByMessageId.size === 0) return;

  targets.forEach(({ msg, messageId }) => {
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

async function attachFilesToLatestUserMessage(messages, files) {
  if (!files || files.length === 0) return;

  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      idx = i;
      break;
    }
  }
  if (idx === -1) return;

  const msg = messages[idx];
  const parts = [];

  if (typeof msg.content === "string" && msg.content.trim()) {
    parts.push({ type: "text", text: msg.content });
  }

  for (const file of files) {
    const mime = file.mimetype || "application/octet-stream";

    if (mime.startsWith("image/")) {
      const base64 = file.buffer.toString("base64");
      const url = `data:${mime};base64,${base64}`;
      parts.push({ type: "image_url", image_url: { url } });
      continue;
    }

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

    const normalized = clipText(textContent);
    const fallbackPreview = `${file.buffer.toString("base64").slice(0, 1600)}...`;
    const preview = normalized || fallbackPreview;
    const note =
      formatHint ||
      (normalized
        ? "已解析文本内容。"
        : "暂未支持该二进制格式，以下为 base64 预览。");

    parts.push({
      type: "text",
      text: `\n[附件: ${file.originalname}]\nMIME: ${mime}\n说明: ${note}\n内容预览:\n${preview}`,
    });
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

async function streamAgentResponse({
  res,
  agentId,
  messages,
  files = [],
  volcengineFileRefs = [],
  runtimeConfig = null,
  chatUserId = "",
  sessionId = "",
  smartContextEnabled = false,
  contextMode = "append",
  attachUploadedFiles = true,
}) {
  const systemPrompt = await getSystemPromptByAgent(agentId);
  const config = runtimeConfig || (await getResolvedAgentRuntimeConfig(agentId));
  const provider = getProviderByAgent(agentId, config);
  const model = getModelByAgent(agentId, config);
  const protocolInfo = resolveRequestProtocol(config.protocol, provider);
  if (!protocolInfo.supported) {
    res.status(400).json({ error: protocolInfo.message });
    return;
  }
  const protocol = protocolInfo.value;
  const shouldUsePersistentFileContext =
    provider === "volcengine" && protocol === "responses";
  const providerConfig = getProviderConfig(provider);
  if (!providerConfig.apiKey) {
    res.status(500).json({
      error: providerConfig.missingKeyMessage,
    });
    return;
  }
  const endpoint =
    protocol === "responses"
      ? providerConfig.responsesEndpoint
      : providerConfig.chatEndpoint;
  if (!endpoint) {
    res.status(500).json({
      error: `当前 provider (${provider}) 未配置 ${protocol} 协议端点。`,
    });
    return;
  }

  const thinkingEnabled = sanitizeEnableThinking(config.enableThinking);
  const reasoningEffortRequested = thinkingEnabled ? "high" : "none";
  const reasoning = resolveReasoningPolicy(
    model,
    reasoningEffortRequested,
    provider,
  );
  const webSearchRuntime = resolveVolcengineWebSearchRuntime({
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
  const safeVolcengineFileRefs = sanitizeVolcengineFileRefsPayload(volcengineFileRefs);
  if (
    safeMessages.length === 0 &&
    attachUploadedFiles &&
    Array.isArray(files) &&
    files.length > 0
  ) {
    safeMessages = [{ role: "user", content: "请基于附件内容进行分析和回答。" }];
  }

  if (safeMessages.length === 0) {
    res.status(400).json({ error: "Messages cannot be empty" });
    return;
  }

  if (shouldUsePersistentFileContext) {
    await rehydrateUploadedFileContexts(safeMessages, {
      userId: chatUserId,
      sessionId,
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
      SYSTEM_PROMPT_LEAK_PROTECTION_TOP_PROMPT,
      composedSystemPrompt,
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
    files.length > 0 &&
    !requestMessages.some((item) => item?.role === "user")
  ) {
    requestMessages.push({
      role: "user",
      content: "请基于附件内容进行分析和回答。",
    });
  }
  if (
    shouldUsePersistentFileContext &&
    safeVolcengineFileRefs.length > 0 &&
    !requestMessages.some((item) => item?.role === "user")
  ) {
    requestMessages.push({
      role: "user",
      content: "请基于附件内容进行分析和回答。",
    });
  }

  let uploadedFileContextRecord = null;
  if (attachUploadedFiles && files.length > 0) {
    uploadedFileContextRecord = await attachFilesToLatestUserMessage(
      requestMessages,
      files,
    );
    if (shouldUsePersistentFileContext && uploadedFileContextRecord?.messageId) {
      await saveUploadedFileContext({
        userId: chatUserId,
        sessionId,
        messageId: uploadedFileContextRecord.messageId,
        content: uploadedFileContextRecord.content,
      });
    }
  }
  if (
    shouldUsePersistentFileContext &&
    safeVolcengineFileRefs.length > 0
  ) {
    // Files API 文件（PDF/图片/视频）由火山侧保存 7 天，这里只在本次请求挂载 file_id，
    // 不再写入本地附件上下文库；本地库仅用于非 Files API 的本地解析文件。
    attachVolcengineFileRefsToLatestUserMessage(
      requestMessages,
      safeVolcengineFileRefs,
    );
  }
  if (smartContextRuntime.usePreviousResponseId) {
    requestMessages = extractSmartContextIncrementalMessages(requestMessages);
  }

  const providerMessages = requestMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const promptLeakGuardEnabled = sanitizeRuntimeBoolean(
    config.preventPromptLeak,
    DEFAULT_AGENT_RUNTIME_CONFIG.preventPromptLeak,
  );
  const promptLeakDetected =
    promptLeakGuardEnabled && isPromptLeakProbeRequest(requestMessages);

  const payload =
    protocol === "responses"
      ? buildResponsesRequestPayload({
          model,
          messages: providerMessages,
          instructions: composedSystemPrompt,
          config,
          thinkingEnabled,
          reasoning,
          webSearchRuntime,
          previousResponseId: smartContextRuntime.previousResponseId,
          forceStore: smartContextRuntime.enabled,
        })
      : buildChatRequestPayload({
          model,
          messages: providerMessages,
          systemPrompt: composedSystemPrompt,
          config,
          reasoning,
        });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
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
    smartContextRequested: smartContextRuntime.requested,
    smartContextEnabled: smartContextRuntime.enabled,
    smartContextUsePreviousResponseId: smartContextRuntime.usePreviousResponseId,
    smartContextSessionId: smartContextRuntime.sessionId,
    promptLeakGuardEnabled,
    promptLeakDetected,
    runtimeConfig: config,
  });

  if (promptLeakDetected) {
    writeEvent(res, "token", { text: "我只是你的助手" });
    writeEvent(res, "done", { ok: true });
    res.end();
    return;
  }

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildProviderHeaders(provider, providerConfig.apiKey, protocol),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`[${provider}/${protocol}] request failed:`, error);
    writeEvent(res, "error", {
      message: `${provider}/${protocol} request failed: ${error.message}`,
    });
    res.end();
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await safeReadText(upstream);
    console.error(`[${provider}/${protocol}] upstream error:`, upstream.status, detail);
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

  try {
    let responsesResult = null;
    if (protocol === "responses") {
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
    console.error(`[${provider}/${protocol}] stream handling failed:`, error);
    writeEvent(res, "error", { message: error.message || "stream failed" });
  } finally {
    res.end();
  }
}

async function streamSeedreamImageGeneration({ res, body, files = [] }) {
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
      await pipeVolcengineImageGenerationSse(upstream, res);
    } else {
      const result = await safeReadJson(upstream);
      emitSeedreamImageGenerationNonStreamEvents(result, res);
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

async function buildSeedreamImageGenerationRequest({ body, files, model }) {
  const prompt = sanitizeText(body?.prompt, "", 2000);
  const size = normalizeSeedreamSize(body?.size);
  const sequentialImageGeneration = normalizeSeedreamSequentialMode(
    body?.sequentialImageGeneration ?? body?.mode,
  );
  const stream = sanitizeRuntimeBoolean(body?.stream, true);
  const watermark = sanitizeRuntimeBoolean(body?.watermark, false);
  const responseFormat = normalizeSeedreamResponseFormat(body?.responseFormat);
  const imageUrls = parseSeedreamImageInputs(body?.imageUrls);
  const fileInputs = buildSeedreamFileImageInputs(files);
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

function buildSeedreamFileImageInputs(files) {
  const safeFiles = Array.isArray(files) ? files : [];
  const list = [];
  safeFiles.forEach((file) => {
    if (!file?.buffer) return;
    const mime = normalizeSeedreamImageMimeType(file.mimetype);
    if (!mime) {
      throw new Error(
        `不支持的图片格式：${file.originalname || "未命名文件"}。仅支持 jpeg、png、webp、bmp、tiff、gif。`,
      );
    }
    list.push(`data:${mime};base64,${file.buffer.toString("base64")}`);
  });
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

async function pipeVolcengineImageGenerationSse(upstream, res) {
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
      writeEvent(res, "image_partial", {
        model,
        created,
        imageIndex,
        url: String(json?.url || ""),
        b64Json: String(json?.b64_json || ""),
        size: sanitizeText(json?.size, "", 80),
      });
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
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const completed = processSseBlock(block);
      if (completed) return;
      boundary = buffer.indexOf("\n\n");
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

function emitSeedreamImageGenerationNonStreamEvents(result, res) {
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
    writeEvent(res, "image_partial", {
      model,
      created,
      imageIndex: idx,
      url: String(imageObj.url || ""),
      b64Json: String(imageObj.b64_json || ""),
      size: sanitizeText(imageObj.size, "", 80),
    });
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

function buildChatRequestPayload({ model, messages, systemPrompt, config, reasoning }) {
  const finalMessages = [];
  if (systemPrompt) {
    finalMessages.push({ role: "system", content: systemPrompt });
  }
  finalMessages.push(...messages);

  const payload = {
    model,
    stream: true,
    messages: finalMessages,
    temperature: sanitizeRuntimeNumber(
      config.temperature,
      DEFAULT_AGENT_RUNTIME_CONFIG.temperature,
      0,
      2,
    ),
    top_p: sanitizeRuntimeNumber(
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
  return payload;
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

function mapReasoningEffortToResponses(effort) {
  const key = String(effort || "")
    .trim()
    .toLowerCase();
  if (key === "none") return "minimal";
  return "high";
}

function supportsVolcengineResponsesReasoningEffort(model) {
  const defaults = [
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

function resolveRequestProtocol(requestedProtocol, provider) {
  const protocol = sanitizeRuntimeProtocol(requestedProtocol);

  if (provider === "volcengine") {
    return { supported: true, value: "responses", forced: protocol !== "responses" };
  }

  if (protocol === "responses" && provider !== "volcengine") {
    return { supported: true, value: "chat", forced: true };
  }

  return { supported: true, value: protocol, forced: false };
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
    agentId: ["A", "B", "C", "D"].includes(agentId) ? agentId : "",
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
        hint: "检测到 .doc（旧版 Word）。请另存为 .docx 后再上传，可获得更准确解析。",
      };
    }
    const text = await parseDocx(file.buffer);
    return { text, hint: "Word 文档解析结果（.docx）。" };
  }

  if (isExcelFile(ext, mime)) {
    const text = parseExcel(file.buffer);
    return { text, hint: "Excel 表格解析结果（按工作表展开）。" };
  }

  if (isPdfFile(ext, mime)) {
    const text = await parsePdf(file.buffer);
    return { text, hint: "PDF 文本解析结果。" };
  }

  if (isTextLikeFile(ext, mime, file.buffer)) {
    return {
      text: decodeTextFile(file.buffer),
      hint: "文本/代码文件解析结果。",
    };
  }

  return { text: "", hint: "暂未支持该格式的结构化解析。" };
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

function clipText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (normalized.length <= MAX_PARSED_CHARS_PER_FILE) return normalized;
  const clipped = normalized.slice(0, MAX_PARSED_CHARS_PER_FILE);
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
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const gotDone = processSseBlock(block);
      if (gotDone) return;
      boundary = buffer.indexOf("\n\n");
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
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const gotDone = processSseBlock(block);
      if (gotDone) return { responseId };
      boundary = buffer.indexOf("\n\n");
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

function extractResponsesWebSearchUsage(responseObj) {
  const usage =
    responseObj?.usage && typeof responseObj.usage === "object"
      ? responseObj.usage
      : {};
  const webSearchCalls = extractNamedToolUsageCount(usage.tool_usage, "web_search");
  const details = extractNamedToolUsageDetails(
    usage.tool_usage_details,
    "web_search",
  );

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
    D: "z-ai/glm-4.7-flash",
  };

  const targetAgent = sanitizeAgent(agentId);
  const map = {
    A: process.env.AGENT_MODEL_A || defaults.A,
    B: process.env.AGENT_MODEL_B || defaults.B,
    C: process.env.AGENT_MODEL_C || defaults.C,
    D: process.env.AGENT_MODEL_D || defaults.D,
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
  const lockTokenFields = protocol === "responses";
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
    source.maxOutputTokens,
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

  return {
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
  };
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
  return {
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
    D: "openrouter",
  };
  const targetAgent = sanitizeAgent(agentId);
  const map = {
    A: process.env.AGENT_PROVIDER_A || defaults.A,
    B: process.env.AGENT_PROVIDER_B || defaults.B,
    C: process.env.AGENT_PROVIDER_C || defaults.C,
    D: process.env.AGENT_PROVIDER_D || defaults.D,
  };
  return normalizeProvider(map[targetAgent] || map.A);
}

function resolveReasoningPolicy(model, requested, provider) {
  const supports = modelSupportsReasoning(model);
  const requires = modelRequiresReasoning(model);
  const providerAllows = providerSupportsReasoning(provider);

  if (!providerAllows) {
    return { enabled: false, effort: "none", forced: requested !== "none" };
  }

  if (requires && requested === "none") {
    return { enabled: true, effort: "high", forced: true };
  }

  if (!supports) {
    return { enabled: false, effort: "none", forced: requested !== "none" };
  }

  if (requested === "none") {
    return { enabled: false, effort: "none", forced: false };
  }

  return { enabled: true, effort: "high", forced: false };
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
  if (provider === "aliyun") return false;
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
    return {
      chatEndpoint:
        process.env.ALIYUN_CHAT_ENDPOINT ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      responsesEndpoint: "",
      apiKey: readEnvApiKey("ALIYUN_API_KEY", "DASHSCOPE_API_KEY"),
      missingKeyMessage:
        "未检测到阿里云 API Key。请在 .env 中配置 ALIYUN_API_KEY（或 DASHSCOPE_API_KEY）。",
    };
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

  if (provider === "volcengine") {
    const volcengineMapped = mapVolcengineUpstreamError({
      status,
      code: errorCode,
      message: errorMessage,
      param: errorParam,
    });
    if (volcengineMapped) return volcengineMapped;
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
      apiTemperature: 0.6,
      apiTopP: 1,
      apiReasoningEffort: "high",
      lastAppliedReasoning: "high",
      smartContextEnabled: false,
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

function sanitizeStateSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const agent = sanitizeAgent(source.agent);
  const apiTemperature = sanitizeNumber(source.apiTemperature, 0.6, 0, 2);
  const apiTopP = sanitizeNumber(source.apiTopP, 1, 0, 1);
  const apiReasoningEffort = sanitizeReasoning(source.apiReasoningEffort, "high");
  const lastAppliedReasoning = sanitizeReasoning(source.lastAppliedReasoning, "high");
  const smartContextEnabled = sanitizeRuntimeBoolean(source.smartContextEnabled, false);

  return {
    agent,
    apiTemperature,
    apiTopP,
    apiReasoningEffort,
    lastAppliedReasoning,
    smartContextEnabled,
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

        return {
          name: sanitizeText(a?.name, "文件", 120),
          type: sanitizeText(a?.type, "", 120),
          size: Number.isFinite(Number(a?.size)) ? Number(a.size) : undefined,
          ...(fileId ? { fileId } : {}),
          ...(fileId && safeInputType ? { inputType: safeInputType } : {}),
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
  if (["A", "B", "C", "D"].includes(id)) return id;
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

async function startServer() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 6000 });
  console.log(`Mongo connected: ${mongoUri}`);
  await ensureUploadedFileContextIndexes().catch((error) => {
    console.warn(
      "Failed to ensure uploaded file context indexes:",
      error?.message || error,
    );
  });

  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
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
