import { AGENT_E_BASE_SYSTEM_PROMPT } from "./constants.js";

const REVIEW_NOTICE_TEXT = "这些内容仅参考，需要用户自己针对文章内容进行复核";

function boolToText(value) {
  return value ? "是" : "否";
}

function buildStructuredOutputContract(reviewPolicy = {}) {
  if (!reviewPolicy.forceStructuredOutput) {
    return [
      "输出约束：",
      "- 先给“主题与研究类型识别”（基于标题/摘要/关键词）。",
      "- 可以灵活组织段落，但必须明确区分“主要问题”和“次要问题”。",
      "- 不输出“接收/拒稿/大修/小修”等最终处理结论。",
      "- 若无重大问题，可明确写“Major Problems: None（基于证据）”。",
      `- 最后一行必须是：${REVIEW_NOTICE_TEXT}`,
    ].join("\n");
  }

  return [
    "最终输出结构（严格，不得缺项）：",
    "- Summary（主题与研究类型识别：题目/摘要/关键词 + 质性/量化/混合 + 文章类型）",
    "- Major Problems（若无，写 `None (evidence-supported)`）",
    "- Minor Problems（若无，写 `None (evidence-supported)`）",
    "- Method & Reporting Risks（方法与报告风险）",
    "- Actionable Revisions（可执行修改建议，含“可补救项/可写入局限与未来研究/难补救提醒”）",
    `- Review Notice（固定为：${REVIEW_NOTICE_TEXT}）`,
  ].join("\n");
}

function buildEvidenceRule(reviewPolicy = {}) {
  if (reviewPolicy.requireEvidenceAnchors) {
    return "证据约束：每条 Major/Minor 问题后必须附“证据锚点”（章节名、段落线索或短引文）。";
  }
  return "证据约束：优先提供证据锚点；若证据不足，明确说明“证据不足”。";
}

function buildSeverityRubric() {
  return [
    "问题分级规则（先归类，再输出）：",
    "- Major：影响结论可信度/内部效度/方法有效性/关键论证成立性的缺陷，且通常较难通过常规修订补救。",
    "- Minor：不改变核心结论但影响清晰度、完整性、可读性、规范性的缺陷。",
    "- 样本量不足通常先归入 Minor；仅在导致研究结论几乎不可解释时才升级为 Major。",
    "- 典型 Major 示例：关键构念（如创造力）仅用单一自我报告量表测量且缺少成果/表现性测量，导致效度缺口难补救。",
    "- 问卷研究需检查题项构建合理性；题项与构念错配可上升为 Major。",
    "- 按事实输出，不设最低数量要求，不得为凑数捏造问题。",
    "- 禁止给出接收/拒稿/大修/小修等结论标签。",
    "- 如果证据支持“无重大问题”，必须明确写出 `Major Problems: None (evidence-supported)`。",
  ].join("\n");
}

function buildMethodFirstRule() {
  return [
    "审稿执行顺序（贴近期刊实务）：",
    "- 第一步：看标题、摘要、关键词，先明确主题与研究类型（质性/量化/混合）。",
    "- 第二步：快速检查全文结构（Introduction/Literature Review/Method/Results/Discussion/Conclusion）。",
    "- 第三步：先定位研究问题，再直奔 Method，优先判断是否存在重大方法缺陷。",
    "- 第四步：若方法无重大缺陷，后续问题原则上视为可通过修订补救。",
    "- 第五步：再审 Introduction 的研究 gap 清晰度与文献综述连贯性（避免罗列式综述）。",
    "- 第六步：审 Discussion 是否充分解释 Results，是否有深度、是否与既有研究形成对比分析。",
  ].join("\n");
}

function buildReportingFlexRule() {
  return [
    "结果报告审查（不过度苛刻）：",
    "- 结果报告以“基本完整、可复核、解释一致”为主，不做教条化一刀切。",
    "- 独立样本 t 检验优先建议补充 Cohen's d（若缺失通常为 Minor）。",
    "- 元分析优先使用 Hedges' g；若使用其他效应量，需说明换算或理由。",
    "- 允许不同研究场景采用差异化报告口径，重点看是否充分说明并不误导结论。",
  ].join("\n");
}

function buildFinalNoticeRule() {
  return [
    "复核提示规则：",
    `- 输出结尾最后一行必须原样写为：${REVIEW_NOTICE_TEXT}`,
    "- 不得改写、扩写、或省略该提示。",
  ].join("\n");
}

export function buildAgentESystemPrompt({ config, selectedSkills = [] }) {
  const safeConfig = config && typeof config === "object" ? config : {};
  const reviewPolicy = safeConfig.reviewPolicy || {};
  const skillPolicy = safeConfig.skillPolicy || {};

  const sections = [AGENT_E_BASE_SYSTEM_PROMPT];

  sections.push(
    [
      "审稿策略：",
      `- 证据锚点必需: ${boolToText(!!reviewPolicy.requireEvidenceAnchors)}`,
      `- 强制结构化输出: ${boolToText(!!reviewPolicy.forceStructuredOutput)}`,
      `- 输出语言: ${String(reviewPolicy.language || "zh-CN")}`,
      `- 严格模式: ${boolToText(!!skillPolicy.strictMode)}`,
      `- 允许通用兜底: ${boolToText(!!skillPolicy.allowFallbackGeneralAnswer)}`,
    ].join("\n"),
  );

  sections.push(buildEvidenceRule(reviewPolicy));
  sections.push(buildMethodFirstRule());
  sections.push(buildSeverityRubric());
  sections.push(buildReportingFlexRule());
  sections.push(buildStructuredOutputContract(reviewPolicy));
  sections.push(buildFinalNoticeRule());

  if (selectedSkills.length > 0) {
    const lines = ["当前启用技能："];
    selectedSkills.forEach((skill, idx) => {
      lines.push(`${idx + 1}. ${skill.name} (${skill.id})`);
      lines.push(`   规则: ${skill.prompt}`);
    });
    sections.push(lines.join("\n"));
  }

  if (skillPolicy.strictMode) {
    sections.push(
      "严格模式附加要求（慎用）：证据不足时提高保守阈值，必须标注信息缺口并给出补充数据建议。",
    );
  }
  if (!skillPolicy.allowFallbackGeneralAnswer) {
    sections.push("禁止兜底：信息不足时不输出泛泛建议，必须点名缺失字段与补充数据清单。");
  }

  return sections.filter(Boolean).join("\n\n");
}
