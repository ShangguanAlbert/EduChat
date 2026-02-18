export const ALIYUN_BEIJING_CHAT_ENDPOINT =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export const ALIYUN_BEIJING_RESPONSES_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses";
export const ALIYUN_BEIJING_DASHSCOPE_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
export const ALIYUN_BEIJING_DASHSCOPE_MULTIMODAL_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

export const ALIYUN_SUPPORTED_PROTOCOLS = Object.freeze([
  "chat",
  "responses",
  "dashscope",
]);

export const ALIYUN_SEARCH_STRATEGIES = Object.freeze([
  "turbo",
  "max",
  "agent",
  "agent_max",
]);
export const ALIYUN_SEARCH_CITATION_FORMATS = Object.freeze([
  "[<number>]",
  "[ref_<number>]",
]);
export const ALIYUN_SEARCH_FRESHNESS_OPTIONS = Object.freeze([
  0,
  7,
  30,
  180,
  365,
]);

/**
 * DashScope 原生端点模型分类（来源：/Users/fuze/Desktop/模型列表.md）
 * - 命中 MULTIMODAL 前缀 -> 走 multimodal-generation
 * - 命中 TEXT 前缀 -> 走 text-generation
 * - 都未命中 -> 交由调用侧回退逻辑处理
 */
export const ALIYUN_DASHSCOPE_MULTIMODAL_MODEL_PREFIXES = Object.freeze([
  "qwen3.5-plus",
  "kimi-k2.5",
  "kimi-2.5",
  "qwen3-vl",
  "qwen-vl",
  "qvq",
  "qwen-omni",
  "qwen3-omni",
  "qwen2.5-omni",
  "qwen-audio",
  "qwen2-audio",
  "qwen2-vl",
  "qwen2.5-vl",
  "qwen3-livetranslate",
]);

export const ALIYUN_DASHSCOPE_TEXT_MODEL_PREFIXES = Object.freeze([
  "qwen3-max",
  "qwen-max",
  "qwen-plus",
  "qwen-flash",
  "qwen-turbo",
  "qwen-long",
  "qwen-coder",
  "qwen-math",
  "qwen-mt-",
  "qwen3-coder",
  "qwen3-",
  "qwen2.5-",
  "qwen2-",
  "qwen-",
  "deepseek-",
  "kimi-",
  "glm-",
  "minimax-",
]);
