import crypto from "node:crypto";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const NIGHTLY_HOUR_UTC = 15;
const NIGHTLY_MINUTE = 30;
const INITIAL_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const LONGITUDINAL_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const REASON_PATTERN = /(因为|原因|所以|依据|意味着|作用|区别|如果|为了|这样|负责|控制)/;

function safeText(value, maxLength = 800) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replaceAll("\0", "")
    .trim()
    .slice(0, maxLength);
}

function safeDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function safeIdList(value, limit = 50) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => safeText(item, 100))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function clampConfidence(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function stableKey(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => safeText(part, 500)).join("\u001f"))
    .digest("hex");
}

export const DEFAULT_HTML_CSS_KNOWLEDGE_POINTS = Object.freeze([
  {
    key: "html_document_structure",
    label: "HTML 文档与页面结构",
    unitTitle: "HTML 基础",
    description: "使用标题、段落、容器等元素组织页面内容。",
    prerequisiteKeys: [],
    htmlPattern: /<(html|head|body|main|h[1-6]|p|div)\b/i,
    cssPattern: null,
    textPattern: /(html|标签|页面结构|标题|段落|容器)/i,
  },
  {
    key: "html_semantics",
    label: "HTML 语义化结构",
    unitTitle: "HTML 结构",
    description: "根据内容含义使用 header、nav、main、section、article 和 footer。",
    prerequisiteKeys: ["html_document_structure"],
    htmlPattern: /<(header|nav|main|section|article|aside|footer)\b/i,
    cssPattern: null,
    textPattern: /(语义化|header|nav|main|section|article|footer)/i,
  },
  {
    key: "html_links_media",
    label: "链接、图片与媒体",
    unitTitle: "HTML 内容",
    description: "使用链接、图片及相关属性组织可访问的网页内容。",
    prerequisiteKeys: ["html_document_structure"],
    htmlPattern: /<(a|img|picture|audio|video)\b/i,
    cssPattern: null,
    textPattern: /(链接|图片|图像|媒体|href|src|alt)/i,
  },
  {
    key: "css_selectors_cascade",
    label: "CSS 选择器、层叠与继承",
    unitTitle: "CSS 基础",
    description: "使用选择器定位元素并理解层叠、优先级与继承。",
    prerequisiteKeys: ["html_document_structure"],
    htmlPattern: /\b(class|id)\s*=/i,
    cssPattern: /(^|\n)\s*([.#][\w-]+|[a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s*\{/i,
    textPattern: /(选择器|层叠|继承|优先级|class|id)/i,
  },
  {
    key: "css_box_model",
    label: "CSS 盒模型",
    unitTitle: "CSS 布局基础",
    description: "理解内容、内边距、边框、外边距和尺寸计算。",
    prerequisiteKeys: ["css_selectors_cascade"],
    htmlPattern: null,
    cssPattern: /\b(margin|padding|border|box-sizing|width|height)\s*:/i,
    textPattern: /(盒模型|内边距|外边距|边框|margin|padding|box-sizing)/i,
  },
  {
    key: "css_flexbox",
    label: "Flexbox 弹性布局",
    unitTitle: "CSS 布局",
    description: "使用主轴、交叉轴、对齐与弹性分配组织一维布局。",
    prerequisiteKeys: ["css_box_model"],
    htmlPattern: null,
    cssPattern: /\b(display\s*:\s*flex|flex-direction|justify-content|align-items|flex-wrap|flex\s*:)/i,
    textPattern: /(flexbox|flex|主轴|交叉轴|justify-content|align-items)/i,
  },
  {
    key: "css_grid",
    label: "CSS Grid 网格布局",
    unitTitle: "CSS 布局",
    description: "使用行、列、网格区域和间距组织二维布局。",
    prerequisiteKeys: ["css_box_model"],
    htmlPattern: null,
    cssPattern: /\b(display\s*:\s*grid|grid-template|grid-area|grid-column|grid-row)/i,
    textPattern: /(grid|网格|行列|grid-template|grid-area)/i,
  },
  {
    key: "css_visual_design",
    label: "颜色、字体与视觉样式",
    unitTitle: "视觉设计",
    description: "运用颜色、字体、背景、圆角和阴影建立视觉层次。",
    prerequisiteKeys: ["css_selectors_cascade"],
    htmlPattern: null,
    cssPattern: /\b(color|background|font-family|font-size|border-radius|box-shadow)\s*:/i,
    textPattern: /(颜色|字体|背景|圆角|阴影|视觉|color|font|background)/i,
  },
  {
    key: "css_responsive_design",
    label: "响应式网页设计",
    unitTitle: "综合布局",
    description: "使用媒体查询、相对尺寸和自适应规则适配不同屏幕。",
    prerequisiteKeys: ["css_flexbox", "css_grid"],
    htmlPattern: /<meta[^>]+name=["']viewport["']/i,
    cssPattern: /@media\b|\b(min|max)-(width|height)\s*:|\b(clamp|vw|vh|rem)\s*\(/i,
    textPattern: /(响应式|自适应|媒体查询|屏幕|@media|viewport)/i,
  },
  {
    key: "web_debugging_preview",
    label: "网页调试与预览验证",
    unitTitle: "调试与迭代",
    description: "通过预览、诊断、局部假设和修改验证定位网页问题。",
    prerequisiteKeys: ["html_document_structure", "css_selectors_cascade"],
    htmlPattern: null,
    cssPattern: null,
    textPattern: /(调试|预览|诊断|报错|验证|检查|debug)/i,
  },
]);

function normalizeKnowledgePoint(rawPoint, index = 0) {
  const label = safeText(rawPoint?.label || rawPoint?.name, 80);
  if (!label) return null;
  const key = safeText(rawPoint?.key, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `teacher-point-${index + 1}`;
  const known = DEFAULT_HTML_CSS_KNOWLEDGE_POINTS.find((point) => point.key === key);
  return {
    key,
    label,
    unitTitle: safeText(rawPoint?.unitTitle, 80),
    description: safeText(rawPoint?.description, 300),
    prerequisiteKeys: safeIdList(rawPoint?.prerequisiteKeys, 12),
    htmlPattern: known?.htmlPattern || null,
    cssPattern: known?.cssPattern || null,
    textPattern: known?.textPattern || null,
  };
}

export function resolveCourseKnowledgeMap(config = {}) {
  const configured = (Array.isArray(config?.knowledgePoints)
    ? config.knowledgePoints
    : [])
    .map(normalizeKnowledgePoint)
    .filter(Boolean);
  if (!configured.length) return DEFAULT_HTML_CSS_KNOWLEDGE_POINTS.map((item) => ({ ...item }));
  const configuredByKey = new Map(configured.map((item) => [item.key, item]));
  return DEFAULT_HTML_CSS_KNOWLEDGE_POINTS
    .map((item) => configuredByKey.get(item.key) || { ...item })
    .concat(configured.filter((item) => !DEFAULT_HTML_CSS_KNOWLEDGE_POINTS.some((known) => known.key === item.key)));
}

export function detectHtmlCssKnowledgePoints(
  { html = "", css = "", text = "" } = {},
  knowledgeMap = DEFAULT_HTML_CSS_KNOWLEDGE_POINTS,
) {
  const safeHtml = safeText(html, 200_000);
  const safeCss = safeText(css, 200_000);
  const safeInputText = safeText(text, 8_000);
  return (Array.isArray(knowledgeMap) ? knowledgeMap : [])
    .filter((point) => {
      if (point?.htmlPattern?.test?.(safeHtml)) return true;
      if (point?.cssPattern?.test?.(safeCss)) return true;
      if (point?.textPattern?.test?.(safeInputText)) return true;
      const label = safeText(point?.label, 80);
      return Boolean(label && safeInputText.includes(label));
    })
    .map((point) => safeText(point?.key, 80))
    .filter(Boolean);
}

export function resolveMostRecentNightlyBoundaryAt(value = new Date()) {
  const now = safeDate(value);
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  let boundaryMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    NIGHTLY_HOUR_UTC,
    NIGHTLY_MINUTE,
  );
  if (boundaryMs > now.getTime()) boundaryMs -= 24 * 60 * 60 * 1000;
  return new Date(boundaryMs);
}

function resolveAcademicTermKey(value = new Date()) {
  const local = new Date(safeDate(value).getTime() + SHANGHAI_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  if (month === 1) return `${year - 1}-fall`;
  if (month <= 7) return `${year}-spring`;
  return `${year}-fall`;
}

function resolveLesson(coursePlans, className, boundaryAt) {
  const safeClassName = safeText(className, 40);
  const boundaryMs = boundaryAt.getTime();
  const candidates = (Array.isArray(coursePlans) ? coursePlans : [])
    .filter((plan) => plan?.enabled !== false)
    .filter((plan) => !safeClassName || safeText(plan?.className, 40) === safeClassName)
    .map((plan) => ({
      ...plan,
      startMs: Date.parse(String(plan?.courseStartAt || "")),
      endMs: Date.parse(String(plan?.courseEndAt || plan?.courseStartAt || "")),
    }))
    .filter((plan) => Number.isFinite(plan.startMs))
    .sort((left, right) => right.startMs - left.startMs);
  return candidates.find((plan) => plan.startMs <= boundaryMs && (!Number.isFinite(plan.endMs) || plan.endMs >= boundaryMs))
    || candidates.find((plan) => plan.startMs <= boundaryMs)
    || null;
}

export function buildPairSubjectId(memberUserIds = []) {
  const members = safeIdList(memberUserIds, 2).sort();
  return members.length === 2 ? `pair-${stableKey(...members).slice(0, 24)}` : "";
}

export function resolveLongitudinalCourseContext({
  room,
  users = [],
  workspace,
  coursePlans = [],
  courseConfig = {},
  boundaryAt = new Date(),
  taskText = "",
} = {}) {
  const roomId = safeText(room?._id || room?.id || workspace?.roomId, 100);
  const memberUserIds = safeIdList(room?.memberUserIds, 2);
  const userById = new Map(
    (Array.isArray(users) ? users : []).map((user) => [safeText(user?._id, 100), user]),
  );
  const classNames = Array.from(new Set(memberUserIds
    .map((userId) => safeText(userById.get(userId)?.profile?.className, 40))
    .filter(Boolean)));
  const className = classNames.length === 1 ? classNames[0] : classNames.join("+");
  const teacherScopeKey = safeText(room?.teacherScopeKey, 80) || "course";
  const configuredCourseId = safeText(courseConfig?.courseId, 80) || "html-css";
  const termName = safeText(courseConfig?.termName, 80) || resolveAcademicTermKey(boundaryAt);
  const courseId = `${teacherScopeKey}:${className || "unassigned"}:${termName}:${configuredCourseId}`;
  const lesson = resolveLesson(coursePlans, classNames[0] || "", safeDate(boundaryAt));
  const taskRevision = Math.max(1, Number(workspace?.taskRevision || 1));
  const projectId = `${roomId}:${taskRevision}`;
  const projectName = safeText(taskText || room?.announcement || lesson?.courseName, 160)
    || `网页作品 ${taskRevision}`;
  const projectKind = /(综合|大作品|项目|作品集|网站)/.test(projectName)
    ? "major"
    : /(小作品|练习|卡片|组件|单页)/.test(projectName)
      ? "small"
      : "practice";
  return {
    roomId,
    teacherScopeKey,
    memberUserIds,
    pairId: buildPairSubjectId(memberUserIds),
    className,
    courseId,
    courseName: safeText(courseConfig?.courseName, 100) || "HTML 与 CSS 网页创作",
    termName,
    syllabusText: safeText(courseConfig?.syllabusText, 20_000),
    lessonId: safeText(lesson?.id, 100),
    lessonName: safeText(lesson?.courseName, 120),
    projectId,
    projectName,
    projectKind,
    taskRevision,
    knowledgeMap: resolveCourseKnowledgeMap(courseConfig),
  };
}

function countEvents(events, predicate) {
  return events.reduce((count, event) => count + (predicate(event) ? 1 : 0), 0);
}

function buildCandidate(common, values) {
  const candidateKey = stableKey(
    common.roomId,
    common.boundaryAt.toISOString(),
    values.subjectType,
    values.subjectId,
    values.memoryType,
    values.conceptKey || "",
  );
  return {
    candidateKey,
    roomId: common.roomId,
    courseId: common.courseId,
    lessonId: common.lessonId,
    projectId: common.projectId,
    sourceEventIds: common.sourceEventIds,
    boundaryAt: common.boundaryAt,
    status: "pending",
    ...values,
    confidence: clampConfidence(values.confidence),
  };
}

function resolveWorkspaceAtBoundary(workspace, boundaryAt) {
  const boundaryMs = boundaryAt.getTime();
  const versions = (Array.isArray(workspace?.versions) ? workspace.versions : [])
    .filter((version) => safeDate(version?.createdAt, new Date(0)).getTime() <= boundaryMs)
    .sort((left, right) => Number(right?.revision || 0) - Number(left?.revision || 0));
  const version = versions[0];
  if (version) {
    return { ...workspace, html: version.html, css: version.css, revision: version.revision };
  }
  const updatedAt = safeDate(workspace?.updatedAt, new Date(0));
  return updatedAt.getTime() <= boundaryMs ? workspace : { ...workspace, html: "", css: "" };
}

export function buildNightlyLongitudinalMemoryCandidates({
  context,
  events = [],
  workspace,
  boundaryAt,
} = {}) {
  if (!context?.roomId || !context?.courseId || !boundaryAt) return [];
  const sortedEvents = (Array.isArray(events) ? events : [])
    .slice()
    .sort((left, right) => safeDate(left?.occurredAt).getTime() - safeDate(right?.occurredAt).getTime());
  if (!sortedEvents.length) return [];
  const windowStartedAt = safeDate(sortedEvents[0]?.occurredAt, new Date(0));
  const safeWorkspace = resolveWorkspaceAtBoundary(workspace || {}, safeDate(boundaryAt));
  const sourceEventIds = sortedEvents.map((event) => safeText(event?._id, 100)).filter(Boolean).slice(-500);
  const taskSwitch = sortedEvents.filter((event) => event?.eventType === "task_switch").at(-1);
  const taskText = safeText(taskSwitch?.metadata?.taskText || context.projectName, 500);
  const codeConceptKeys = detectHtmlCssKnowledgePoints(
    { html: safeWorkspace?.html, css: safeWorkspace?.css, text: taskText },
    context.knowledgeMap,
  );
  const common = {
    roomId: context.roomId,
    courseId: context.courseId,
    lessonId: context.lessonId,
    projectId: context.projectId,
    sourceEventIds,
    boundaryAt: safeDate(boundaryAt),
  };
  const eventCounts = {
    chat: countEvents(sortedEvents, (event) => event?.eventType === "chat_message"),
    edit: countEvents(sortedEvents, (event) => event?.eventType === "code_edit"),
    preview: countEvents(sortedEvents, (event) => event?.eventType === "preview"),
    diagnostic: countEvents(sortedEvents, (event) => event?.eventType === "diagnostic_error"),
    roleRotation: countEvents(sortedEvents, (event) => event?.eventType === "role_rotation"),
    intervention: countEvents(sortedEvents, (event) => event?.eventType === "paia_intervention"),
    feedback: countEvents(sortedEvents, (event) => event?.eventType === "paia_feedback"),
  };
  const candidates = [];

  candidates.push(buildCandidate(common, {
    subjectType: "project",
    subjectId: context.projectId,
    memoryType: "project_snapshot",
    conceptKey: "",
    summary: `作品“${context.projectName}”记录到代码版本 ${Math.max(1, Number(safeWorkspace?.revision || 1))}，处于${safeText(safeWorkspace?.taskStage, 30) || "理解任务"}阶段，涉及 ${codeConceptKeys.length} 个课程知识点，仍有 ${Array.isArray(safeWorkspace?.lastDiagnostics) ? safeWorkspace.lastDiagnostics.length : 0} 个基础诊断项。`,
    payload: {
      projectName: context.projectName,
      projectKind: context.projectKind,
      taskText,
      taskStage: safeText(safeWorkspace?.taskStage, 30) || "understand",
      revision: Math.max(1, Number(safeWorkspace?.revision || 1)),
      htmlLength: safeText(safeWorkspace?.html, 200_000).length,
      cssLength: safeText(safeWorkspace?.css, 200_000).length,
      knowledgePointKeys: codeConceptKeys,
      diagnostics: (Array.isArray(safeWorkspace?.lastDiagnostics) ? safeWorkspace.lastDiagnostics : [])
        .map((item) => safeText(item, 300))
        .filter(Boolean)
        .slice(0, 10),
      lastPreviewAt: safeWorkspace?.lastPreviewAt || null,
      eventCounts,
    },
    confidence: 1,
  }));

  const activityByUserId = new Map(context.memberUserIds.map((userId) => [userId, {
    chat: 0,
    edit: 0,
    preview: 0,
    driver: 0,
    navigator: 0,
  }]));
  sortedEvents.forEach((event) => {
    const userId = safeText(event?.userId, 100);
    const activity = activityByUserId.get(userId);
    if (!activity) return;
    if (event?.eventType === "chat_message") activity.chat += 1;
    if (event?.eventType === "code_edit") activity.edit += 1;
    if (event?.eventType === "preview") activity.preview += 1;
    if (event?.role === "driver") activity.driver += 1;
    if (event?.role === "navigator") activity.navigator += 1;
  });
  const contributionCounts = Array.from(activityByUserId.values())
    .map((activity) => activity.chat + activity.edit + activity.preview);
  const contributionTotal = contributionCounts.reduce((sum, count) => sum + count, 0);
  const balanceScore = contributionCounts.length === 2 && contributionTotal > 0
    ? 1 - Math.abs(contributionCounts[0] - contributionCounts[1]) / contributionTotal
    : 0;

  if (context.pairId) {
    candidates.push(buildCandidate(common, {
      subjectType: "pair",
      subjectId: context.pairId,
      memoryType: "collaboration_pattern",
      conceptKey: "",
      summary: `本次作品记录到 ${eventCounts.chat} 次讨论、${eventCounts.edit} 次代码修改、${eventCounts.preview} 次预览和 ${eventCounts.roleRotation} 次角色交接；参与均衡度是行为指标，不能单独解释学生能力或态度。`,
      payload: {
        projectId: context.projectId,
        projectKind: context.projectKind,
        memberActivity: Object.fromEntries(activityByUserId),
        balanceScore: Number(balanceScore.toFixed(3)),
        eventCounts,
      },
      confidence: Math.min(0.9, 0.4 + contributionTotal / 40),
    }));
    if (contributionTotal >= 10 && balanceScore < 0.35) {
      candidates.push(buildCandidate(common, {
        subjectType: "pair",
        subjectId: context.pairId,
        memoryType: "ability_judgment",
        conceptKey: "collaboration_balance",
        summary: `这对搭档在作品“${context.projectName}”中的协作参与均衡较弱，当前需要角色协调支持；教师可回看讨论、代码修改和预览记录确认。`,
        payload: {
          projectId: context.projectId,
          dimension: "collaboration_balance",
          level: "needs_support",
          balanceScore: Number(balanceScore.toFixed(3)),
          contributionTotal,
          evidenceKinds: ["chat_activity", "code_activity", "preview_activity"],
        },
        confidence: Math.min(0.85, 0.62 + contributionTotal / 100),
      }));
    }
  }

  context.memberUserIds.forEach((userId) => {
    const activity = activityByUserId.get(userId) || {};
    const userEvents = sortedEvents.filter((event) => safeText(event?.userId, 100) === userId);
    const explanationTexts = userEvents
      .filter((event) => event?.eventType === "chat_message")
      .map((event) => safeText(event?.metadata?.content, 800))
      .filter((text) => REASON_PATTERN.test(text));
    const explanationConceptKeys = detectHtmlCssKnowledgePoints(
      { text: explanationTexts.join("\n") },
      context.knowledgeMap,
    );
    const authoredVersions = (Array.isArray(safeWorkspace?.versions) ? safeWorkspace.versions : [])
      .filter((version) => safeText(version?.savedByUserId, 100) === userId)
      .filter((version) => safeDate(version?.createdAt, new Date(0)).getTime() > windowStartedAt.getTime())
      .filter((version) => safeDate(version?.createdAt, new Date(0)).getTime() <= common.boundaryAt.getTime());
    const codeContributionConceptKeys = Array.from(new Set(authoredVersions.flatMap((version) =>
      detectHtmlCssKnowledgePoints(
        { html: version?.html, css: version?.css },
        context.knowledgeMap,
      ))));
    candidates.push(buildCandidate(common, {
      subjectType: "student",
      subjectId: userId,
      memoryType: "learning_activity",
      conceptKey: "",
      summary: `本次记录到该学生 ${Number(activity.chat || 0)} 次讨论、${Number(activity.edit || 0)} 次代码修改和 ${Number(activity.preview || 0)} 次预览操作；这些是活动证据，不直接代表知识掌握程度。`,
      payload: {
        projectId: context.projectId,
        roleActivity: activity,
        explanationConceptKeys,
        codeContributionConceptKeys,
      },
      confidence: Math.min(0.85, 0.35 + userEvents.length / 30),
    }));
    const studentDiagnosticCount = countEvents(
      userEvents,
      (event) => event?.eventType === "diagnostic_error",
    );
    if (studentDiagnosticCount >= 2 && Number(activity.preview || 0) >= 2) {
      candidates.push(buildCandidate(common, {
        subjectType: "student",
        subjectId: userId,
        memoryType: "ability_judgment",
        conceptKey: "web_debugging_preview",
        summary: `该学生在作品“${context.projectName}”中多次预览后仍出现基础诊断问题，系统判断其当前网页调试能力需要支持；教师可结合对应代码版本确认。`,
        payload: {
          projectId: context.projectId,
          dimension: "web_debugging_preview",
          level: "needs_support",
          diagnosticCount: studentDiagnosticCount,
          previewCount: Number(activity.preview || 0),
          evidenceKinds: ["preview", "diagnostic_error", "code_version"],
        },
        confidence: Math.min(0.82, 0.58 + studentDiagnosticCount / 20),
      }));
    }
    Array.from(new Set([...explanationConceptKeys, ...codeContributionConceptKeys])).forEach((conceptKey) => {
      const point = context.knowledgeMap.find((item) => item.key === conceptKey);
      const hasExplanation = explanationConceptKeys.includes(conceptKey);
      const hasCodeContribution = codeContributionConceptKeys.includes(conceptKey);
      candidates.push(buildCandidate(common, {
        subjectType: "student",
        subjectId: userId,
        memoryType: "knowledge_evidence",
        conceptKey,
        summary: `在作品“${context.projectName}”中观察到与“${point?.label || conceptKey}”相关的${[hasExplanation ? "解释" : "", hasCodeContribution ? "代码贡献" : ""].filter(Boolean).join("和")}证据，尚不据此判定已经掌握。`,
        payload: {
          projectId: context.projectId,
          projectKind: context.projectKind,
          evidenceKinds: [hasExplanation ? "reasoned_dialogue" : "", hasCodeContribution ? "code_contribution" : ""].filter(Boolean),
          evidenceState: "observed",
        },
        confidence: hasExplanation && hasCodeContribution ? 0.72 : 0.55,
      }));
    });
  });

  candidates.push(buildCandidate(common, {
    subjectType: "course",
    subjectId: context.courseId,
    memoryType: "course_progress",
    conceptKey: "",
    summary: `课程在“${context.projectName}”中出现了 ${codeConceptKeys.length} 个可识别知识点；该记录用于连接小作品与后续综合作品。`,
    payload: {
      className: context.className,
      lessonId: context.lessonId,
      lessonName: context.lessonName,
      projectId: context.projectId,
      projectKind: context.projectKind,
      knowledgePointKeys: codeConceptKeys,
    },
    confidence: 0.9,
  }));

  if (eventCounts.intervention || eventCounts.feedback) {
    candidates.push(buildCandidate(common, {
      subjectType: "agent",
      subjectId: context.roomId,
      memoryType: "agent_outcome",
      conceptKey: "",
      summary: `琳琳本次主动支持 ${eventCounts.intervention} 次，收到学生反馈 ${eventCounts.feedback} 次；具体策略效果继续由人类验证的协作策略记忆维护。`,
      payload: {
        interventionCount: eventCounts.intervention,
        feedbackCount: eventCounts.feedback,
        projectId: context.projectId,
      },
      confidence: eventCounts.feedback ? 0.9 : 0.55,
    }));
  }
  return candidates;
}

function buildMemoryIdentity(candidate) {
  return {
    courseId: safeText(candidate?.courseId, 200),
    subjectType: safeText(candidate?.subjectType, 30),
    subjectId: safeText(candidate?.subjectId, 100),
    memoryType: safeText(candidate?.memoryType, 60),
    conceptKey: safeText(candidate?.conceptKey, 80),
  };
}

export async function consolidateEligibleLongitudinalMemories({
  Candidate,
  Memory,
  now = new Date(),
  limit = 500,
} = {}) {
  if (!Candidate || !Memory) return { candidates: 0 };
  const consolidatedAt = safeDate(now);
  await Candidate.updateMany(
    {
      status: "processing",
      claimedAt: { $lte: new Date(consolidatedAt.getTime() - PROCESSING_LEASE_MS) },
    },
    { $set: { status: "pending", claimedAt: null } },
  );
  let processed = 0;
  while (processed < Math.max(1, Math.min(2_000, Number(limit) || 500))) {
    const candidate = await Candidate.findOneAndUpdate(
      { status: "pending", boundaryAt: { $lte: consolidatedAt } },
      { $set: { status: "processing", claimedAt: consolidatedAt, lastError: "" } },
      { new: true, sort: { boundaryAt: 1, createdAt: 1 } },
    ).lean();
    if (!candidate) break;
    try {
      const candidateId = safeText(candidate?._id, 100);
      const identity = buildMemoryIdentity(candidate);
      const existing = await Memory.findOne(identity).lean();
      const alreadyApplied = safeIdList(existing?.sourceCandidateIds, 5_000).includes(candidateId);
      if (!alreadyApplied) {
        const previousEvidenceCount = Math.max(0, Number(existing?.evidenceCount || 0));
        const crossedProjectBoundary = previousEvidenceCount > 0
          && safeText(existing?.projectId, 100)
          && safeText(existing?.projectId, 100) !== safeText(candidate?.projectId, 100);
        let consolidatedSummary = safeText(candidate?.summary, 1_200);
        if (candidate?.memoryType === "knowledge_evidence" && crossedProjectBoundary) {
          consolidatedSummary = `该知识点已在至少 ${previousEvidenceCount + 1} 次可追溯记录中出现，并涉及不同作品；这些仍是学习证据，是否形成独立迁移需要结合后续无支架表现判断。`;
        } else if (candidate?.memoryType === "ability_judgment" && crossedProjectBoundary) {
          consolidatedSummary = `该能力判断已在至少 ${previousEvidenceCount + 1} 次可追溯记录中出现，并涉及不同作品。最新判断：${consolidatedSummary}`;
        } else if (candidate?.memoryType === "collaboration_pattern" && previousEvidenceCount > 0) {
          consolidatedSummary = `这对搭档已有 ${previousEvidenceCount + 1} 次夜间协作记录。最新一次：${consolidatedSummary}`;
        }
        const preserveTeacherSummary = Boolean(existing?.teacherEditedAt);
        await Memory.findOneAndUpdate(
          identity,
          {
            $set: {
              roomId: safeText(candidate?.roomId, 100),
              lessonId: safeText(candidate?.lessonId, 100),
              projectId: safeText(candidate?.projectId, 100),
              ...(preserveTeacherSummary ? {} : { summary: consolidatedSummary }),
              payload: candidate?.payload || {},
              confidence: clampConfidence(candidate?.confidence),
              lastBoundaryAt: safeDate(candidate?.boundaryAt, consolidatedAt),
              consolidatedAt,
              expiresAt: new Date(consolidatedAt.getTime() + LONGITUDINAL_RETENTION_MS),
            },
            $setOnInsert: {
              createdAt: consolidatedAt,
              useCount: 0,
              validationStatus: safeText(candidate?.validationStatus, 30) || "system_observed",
            },
            $inc: { evidenceCount: 1 },
            $addToSet: { sourceCandidateIds: candidateId },
            $push: {
              history: {
                $each: [{
                  candidateId,
                  summary: safeText(candidate?.summary, 1_200),
                  payload: candidate?.payload || {},
                  confidence: clampConfidence(candidate?.confidence),
                  boundaryAt: safeDate(candidate?.boundaryAt, consolidatedAt),
                }],
                $slice: -12,
              },
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        ).lean();
      }
      await Candidate.updateOne(
        { _id: candidate._id, status: "processing" },
        { $set: { status: "consolidated", consolidatedAt, claimedAt: null, lastError: "" } },
      );
      processed += 1;
    } catch (error) {
      await Candidate.updateOne(
        { _id: candidate._id, status: "processing" },
        {
          $set: {
            status: "pending",
            claimedAt: null,
            lastError: safeText(error?.message || "纵向记忆整合失败。", 500),
          },
        },
      );
      throw error;
    }
  }
  return { candidates: processed };
}

async function readLearningEventsWindow({
  LearningEvent,
  roomId,
  after,
  through,
  pageSize = 5_000,
  maxEvents = 100_000,
}) {
  const events = [];
  let cursorAt = safeDate(after, new Date(0));
  let cursorId = null;
  while (events.length < maxEvents) {
    const cursorFilter = cursorId
      ? {
          $or: [
            { occurredAt: { $gt: cursorAt, $lte: through } },
            { occurredAt: cursorAt, _id: { $gt: cursorId } },
          ],
        }
      : { occurredAt: { $gt: cursorAt, $lte: through } };
    const page = await LearningEvent.find({ roomId, ...cursorFilter })
      .sort({ occurredAt: 1, _id: 1 })
      .limit(pageSize)
      .lean();
    if (!page.length) break;
    events.push(...page);
    const latest = page.at(-1);
    cursorAt = safeDate(latest?.occurredAt, cursorAt);
    cursorId = latest?._id || null;
    if (page.length < pageSize) break;
  }
  if (events.length >= maxEvents) {
    throw new Error(`房间 ${roomId} 在一个夜间窗口内超过 ${maxEvents} 条学习事件，已停止编译以避免静默丢失。`);
  }
  return events;
}

export async function compileEligibleLongitudinalMemories({
  LearningEvent,
  GroupChatRoom,
  AuthUser,
  Workspace,
  AdminConfig,
  Candidate,
  Memory,
  CompilationState,
  now = new Date(),
} = {}) {
  if (!LearningEvent || !GroupChatRoom || !AuthUser || !Workspace || !Candidate || !Memory || !CompilationState) {
    return { rooms: 0, candidates: 0, consolidated: 0 };
  }
  const boundaryAt = resolveMostRecentNightlyBoundaryAt(now);
  const [roomIds, configDoc] = await Promise.all([
    LearningEvent.distinct("roomId", { occurredAt: { $lte: boundaryAt } }),
    AdminConfig?.findOne?.({ key: "global" }, {
      teacherCoursePlans: 1,
      paiaCourseMemoryConfig: 1,
    })?.lean?.() || Promise.resolve(null),
  ]);
  const coursePlans = Array.isArray(configDoc?.teacherCoursePlans) ? configDoc.teacherCoursePlans : [];
  const courseConfig = configDoc?.paiaCourseMemoryConfig || {};
  let roomCount = 0;
  let candidateCount = 0;
  for (const rawRoomId of safeIdList(roomIds, 2_000)) {
    const roomId = safeText(rawRoomId, 100);
    const state = await CompilationState.findOne({ roomId }).lean();
    const previousBoundaryAt = state?.lastBoundaryAt
      ? safeDate(state.lastBoundaryAt)
      : new Date(boundaryAt.getTime() - INITIAL_LOOKBACK_MS);
    if (previousBoundaryAt.getTime() >= boundaryAt.getTime()) continue;
    let events = [];
    try {
      events = await readLearningEventsWindow({
        LearningEvent,
        roomId,
        after: previousBoundaryAt,
        through: boundaryAt,
      });
    } catch (error) {
      await CompilationState.findOneAndUpdate(
        { roomId },
        {
          $set: {
            lastCompiledAt: safeDate(now),
            lastCandidateCount: 0,
            lastError: safeText(error?.message || "读取夜间学习事件失败。", 500),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      continue;
    }
    if (!events.length) {
      await CompilationState.findOneAndUpdate(
        { roomId },
        { $set: { lastBoundaryAt: boundaryAt, lastCompiledAt: safeDate(now), lastCandidateCount: 0, lastError: "" } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      continue;
    }
    const [room, workspace] = await Promise.all([
      GroupChatRoom.findOne({ _id: roomId, teacherScopeKey: "shi-gaojun" }).lean(),
      Workspace.findOne({ roomId }).lean(),
    ]);
    if (!room || !workspace) continue;
    const users = await AuthUser.find(
      { _id: { $in: safeIdList(room.memberUserIds, 2) } },
      { profile: 1, username: 1 },
    ).lean();
    const taskText = safeText(
      events.filter((event) => event?.eventType === "task_switch").at(-1)?.metadata?.taskText
        || room?.announcement,
      500,
    );
    const context = resolveLongitudinalCourseContext({
      room,
      users,
      workspace,
      coursePlans,
      courseConfig,
      boundaryAt,
      taskText,
    });
    const candidates = buildNightlyLongitudinalMemoryCandidates({
      context,
      events,
      workspace,
      boundaryAt,
    });
    for (const candidate of candidates) {
      await Candidate.findOneAndUpdate(
        { candidateKey: candidate.candidateKey },
        { $setOnInsert: candidate },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }
    await CompilationState.findOneAndUpdate(
      { roomId },
      {
        $set: {
          lastBoundaryAt: boundaryAt,
          lastCompiledAt: safeDate(now),
          lastCandidateCount: candidates.length,
          lastError: "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    roomCount += 1;
    candidateCount += candidates.length;
  }
  const consolidated = await consolidateEligibleLongitudinalMemories({
    Candidate,
    Memory,
    now,
  });
  return { rooms: roomCount, candidates: candidateCount, consolidated: consolidated.candidates };
}

const SUBJECT_PRIORITY = Object.freeze({ project: 0, pair: 1, student: 2, course: 3, agent: 4 });
const SUBJECT_LABELS = Object.freeze({
  project: "作品连续性",
  pair: "搭档协作经历",
  student: "学生学习证据",
  course: "课程进展",
  agent: "琳琳策略记录",
});

export async function readLongitudinalMemoryBriefing({
  Memory,
  context,
  now = new Date(),
  limit = 16,
  maxChars = 4_000,
  useType = "student_reply",
} = {}) {
  if (!Memory || !context?.courseId) return { text: "", memoryIds: [], items: [] };
  const subjectFilters = [
    context.roomId ? { subjectType: "project", roomId: context.roomId } : null,
    context.pairId ? { subjectType: "pair", subjectId: context.pairId, roomId: context.roomId } : null,
    ...safeIdList(context.memberUserIds, 2).map((userId) => ({
      subjectType: "student",
      subjectId: userId,
      roomId: context.roomId,
    })),
    { subjectType: "course", subjectId: context.courseId },
    context.roomId ? { subjectType: "agent", subjectId: context.roomId, roomId: context.roomId } : null,
  ].filter(Boolean);
  const safeUseType = safeText(useType, 40) || "student_reply";
  const docs = await Memory.find({
    courseId: context.courseId,
    expiresAt: { $gt: safeDate(now) },
    validationStatus: { $ne: "human_rejected" },
    retrievalEnabled: { $ne: false },
    $and: [
      { $or: subjectFilters },
      {
        $or: [
          { allowedUseTypes: safeUseType },
          { allowedUseTypes: { $exists: false } },
        ],
      },
    ],
  })
    .sort({ lastBoundaryAt: -1 })
    .limit(Math.max(1, Math.min(40, Number(limit) * 2 || 32)))
    .lean();
  const items = (Array.isArray(docs) ? docs : [])
    .sort((left, right) => {
      const leftCurrentProject = left?.subjectType === "project"
        && safeText(left?.subjectId, 100) === safeText(context.projectId, 100);
      const rightCurrentProject = right?.subjectType === "project"
        && safeText(right?.subjectId, 100) === safeText(context.projectId, 100);
      if (leftCurrentProject !== rightCurrentProject) return leftCurrentProject ? -1 : 1;
      const priority = (SUBJECT_PRIORITY[left?.subjectType] ?? 9) - (SUBJECT_PRIORITY[right?.subjectType] ?? 9);
      if (priority !== 0) return priority;
      return safeDate(right?.lastBoundaryAt, new Date(0)).getTime()
        - safeDate(left?.lastBoundaryAt, new Date(0)).getTime();
    })
    .slice(0, Math.max(1, Math.min(24, Number(limit) || 16)));
  const lines = [];
  const selectedItems = [];
  for (const item of items) {
    const line = `${SUBJECT_LABELS[item?.subjectType] || "历史证据"}：${safeText(item?.summary, 800)}`;
    if (!line.trim() || lines.join("\n").length + line.length > maxChars) continue;
    lines.push(line);
    selectedItems.push(item);
  }
  return {
    text: lines.join("\n"),
    memoryIds: selectedItems.map((item) => safeText(item?._id, 100)).filter(Boolean),
    items: selectedItems,
  };
}

export async function markLongitudinalMemoriesUsed({
  Memory,
  memoryIds = [],
  now = new Date(),
} = {}) {
  const ids = safeIdList(memoryIds, 24);
  if (!Memory || !ids.length) return null;
  return Memory.updateMany(
    { _id: { $in: ids } },
    { $inc: { useCount: 1 }, $set: { lastUsedAt: safeDate(now) } },
  );
}
