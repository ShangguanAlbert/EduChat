import {
  formatTimestamp,
  normalizeRuntimeSnapshot,
  normalizeTemperature,
  normalizeTopP,
} from "./chatHelpers";

export function getSafeFileBaseName(sessionTitle) {
  const raw = String(sessionTitle || "").trim() || "chat-export";
  return raw.replace(/[\\/:*?"<>|]/g, "_");
}

function formatMessageBlock(m) {
  const role = m.role === "assistant" ? "助手" : "用户";
  const attachments = m.attachments?.length
    ? `\n附件：${m.attachments.map((a) => a.name).join("，")}`
    : "";
  const reasoning = m.reasoning?.trim() ? `\n思路：\n${m.reasoning.trim()}` : "";
  const body = m.content?.trim() ? m.content : "";
  const feedback =
    m.role === "assistant"
      ? m.feedback === "up"
        ? "点赞"
        : m.feedback === "down"
          ? "点踩（答得不好）"
          : ""
      : "";
  const askedAt = m.askedAt ? formatTimestamp(m.askedAt) : "";
  const firstTextAt = m.firstTextAt ? formatTimestamp(m.firstTextAt) : "";
  const runtime = m.role === "assistant" ? normalizeRuntimeSnapshot(m.runtime) : null;

  return {
    role,
    body,
    attachments,
    reasoning,
    askedAt,
    firstTextAt,
    feedback,
    runtime,
  };
}

export function buildExportMeta({
  activeSession,
  groups,
  messages,
  userInfo,
  activeAgentName,
  apiTemperature,
  apiTopP,
  apiReasoningEffort,
  lastAppliedReasoning,
}) {
  const now = new Date();
  const group = groups.find((g) => g.id === activeSession?.groupId) || null;
  const latestRuntime = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.runtime)?.runtime;

  return {
    exportedAt: now.toLocaleString("zh-CN", { hour12: false }),
    sessionTitle: activeSession?.title || "未命名会话",
    sessionId: activeSession?.id || "-",
    groupName: group ? group.name : "未分组",
    userName: userInfo.name || "-",
    studentId: userInfo.studentId || "-",
    gender: userInfo.gender || "-",
    grade: userInfo.grade || "-",
    className: userInfo.className || "-",
    currentAgentName: activeAgentName,
    currentAgentModel: latestRuntime?.model || "pending",
    currentProvider: latestRuntime?.provider || "pending",
    temperature: normalizeTemperature(apiTemperature),
    topP: normalizeTopP(apiTopP),
    reasoningRequested: apiReasoningEffort,
    reasoningApplied: lastAppliedReasoning,
    messageCount: messages.length,
  };
}

export function formatMarkdownExport(messages, meta) {
  const lines = [
    `# ${meta.sessionTitle}`,
    "",
    "## 会话元信息",
    "",
    `- 导出时间：${meta.exportedAt}`,
    `- 会话标题：${meta.sessionTitle}`,
    `- 会话 ID：${meta.sessionId}`,
    `- 所属分组：${meta.groupName}`,
    `- 姓名：${meta.userName}`,
    `- 学号：${meta.studentId}`,
    `- 性别：${meta.gender}`,
    `- 年级：${meta.grade}`,
    `- 班级：${meta.className}`,
    `- 智能体：${meta.currentAgentName}`,
    `- Provider：${meta.currentProvider}`,
    `- 模型：${meta.currentAgentModel}`,
    `- Temperature：${meta.temperature}`,
    `- Top-p：${meta.topP}`,
    `- Reasoning（请求）：${meta.reasoningRequested}`,
    `- Reasoning（生效）：${meta.reasoningApplied}`,
    `- 消息数量：${meta.messageCount}`,
    "",
    "## 聊天记录",
    "",
  ];

  messages.forEach((m) => {
    const block = formatMessageBlock(m);
    lines.push(`## ${block.role}`);
    lines.push("");
    if (block.askedAt) lines.push(`- 提问时间：${block.askedAt}`);
    if (block.firstTextAt) lines.push(`- 首字输出时间：${block.firstTextAt}`);
    if (block.feedback) lines.push(`- 反馈：${block.feedback}`);
    if (block.runtime) {
      lines.push(`- 回答智能体：${block.runtime.agentName}（${block.runtime.agentId}）`);
      lines.push(`- 回答 Provider：${block.runtime.provider}`);
      lines.push(`- 回答模型：${block.runtime.model}`);
      lines.push(`- 回答 Temperature：${block.runtime.temperature}`);
      lines.push(`- 回答 Top-p：${block.runtime.topP}`);
      lines.push(`- 回答 Reasoning（请求）：${block.runtime.reasoningRequested}`);
      lines.push(`- 回答 Reasoning（生效）：${block.runtime.reasoningApplied}`);
    }
    if (block.body) lines.push(block.body);
    if (block.reasoning) lines.push(block.reasoning.trim());
    if (block.attachments) lines.push(block.attachments.trim());
    lines.push("");
  });

  return lines.join("\n");
}

export function formatTxtExport(messages, meta) {
  const lines = [
    `${meta.sessionTitle}`,
    "====================",
    `导出时间: ${meta.exportedAt}`,
    `会话标题: ${meta.sessionTitle}`,
    `会话ID: ${meta.sessionId}`,
    `所属分组: ${meta.groupName}`,
    `姓名: ${meta.userName}`,
    `学号: ${meta.studentId}`,
    `性别: ${meta.gender}`,
    `年级: ${meta.grade}`,
    `班级: ${meta.className}`,
    `智能体: ${meta.currentAgentName}`,
    `Provider: ${meta.currentProvider}`,
    `模型: ${meta.currentAgentModel}`,
    `Temperature: ${meta.temperature}`,
    `Top-p: ${meta.topP}`,
    `Reasoning(requested): ${meta.reasoningRequested}`,
    `Reasoning(applied): ${meta.reasoningApplied}`,
    `消息数量: ${meta.messageCount}`,
    "",
    "聊天记录",
    "--------------------",
    "",
  ];

  messages.forEach((m) => {
    const block = formatMessageBlock(m);
    lines.push(`${block.role}:`);
    if (block.askedAt) lines.push(`提问时间: ${block.askedAt}`);
    if (block.firstTextAt) lines.push(`首字输出时间: ${block.firstTextAt}`);
    if (block.feedback) lines.push(`反馈: ${block.feedback}`);
    if (block.runtime) {
      lines.push(`回答智能体: ${block.runtime.agentName} (${block.runtime.agentId})`);
      lines.push(`回答Provider: ${block.runtime.provider}`);
      lines.push(`回答模型: ${block.runtime.model}`);
      lines.push(`回答Temperature: ${block.runtime.temperature}`);
      lines.push(`回答Top-p: ${block.runtime.topP}`);
      lines.push(`回答Reasoning(requested): ${block.runtime.reasoningRequested}`);
      lines.push(`回答Reasoning(applied): ${block.runtime.reasoningApplied}`);
    }
    if (block.body) lines.push(block.body);
    if (block.reasoning) lines.push(block.reasoning.trim());
    if (block.attachments) lines.push(block.attachments.trim());
    lines.push("");
  });

  return lines.join("\n");
}
