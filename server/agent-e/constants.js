export const AGENT_E_ID = "E";
export const AGENT_E_CONFIG_KEY = "global";
export const AGENT_E_FIXED_PROVIDER = "volcengine";
export const AGENT_E_FIXED_PROTOCOL = "responses";
export const AGENT_E_FIXED_MODEL = "doubao-seed-2-0-pro-260215";
export const AGENT_E_FIXED_TEMPERATURE = 1;
export const AGENT_E_FIXED_TOP_P = 0.95;
export const AGENT_E_FIXED_MAX_OUTPUT_TOKENS = 131072;

export const AGENT_E_DEFAULT_RUNTIME = Object.freeze({
  provider: AGENT_E_FIXED_PROVIDER,
  model: AGENT_E_FIXED_MODEL,
  protocol: AGENT_E_FIXED_PROTOCOL,
  temperature: AGENT_E_FIXED_TEMPERATURE,
  topP: AGENT_E_FIXED_TOP_P,
  frequencyPenalty: 0,
  presencePenalty: 0,
  contextRounds: 12,
  maxOutputTokens: AGENT_E_FIXED_MAX_OUTPUT_TOKENS,
  maxReasoningTokens: 32000,
  enableThinking: true,
  includeCurrentTime: false,
  injectSafetyPrompt: false,
  preventPromptLeak: false,
  openrouterPdfEngine: "auto",
});

export const AGENT_E_DEFAULT_PROVIDER_POLICY = Object.freeze({
  mode: "locked",
  lockedProvider: AGENT_E_FIXED_PROVIDER,
});

export const AGENT_E_DEFAULT_REVIEW_POLICY = Object.freeze({
  language: "zh-CN",
  requireEvidenceAnchors: true,
  forceStructuredOutput: false,
});

export const AGENT_E_DEFAULT_SKILL_POLICY = Object.freeze({
  autoSelect: true,
  strictMode: false,
  maxSkillsPerTurn: 3,
  allowFallbackGeneralAnswer: false,
});

export const AGENT_E_BASE_SYSTEM_PROMPT = `你是 SSCI教育学/教育技术学论文审稿助手（SSCI审稿人）。

遵循以下规则：
1. 优先识别研究问题、理论框架、方法、结果与结论是否一致。
2. 所有批评必须给出证据锚点（章节名、段落线索或原文短语）。
3. 避免空泛评价，所有建议要可执行。
4. 若关键信息缺失，先明确指出“缺失项”，再给补救建议。
5. 默认使用中文输出；引用术语时可保留英文原词。
6. 不得为满足数量要求而制造问题；若无重大问题，可明确写“Major Problems: None（基于证据）”。
7. 禁止输出“接收/拒稿/大修/小修”这类最终处理结论，只输出问题清单与修改建议。
8. 输出末尾必须附固定提示：“这些内容仅参考，需要用户自己针对文章内容进行复核”。
`;
