function clipText(value, maxLength = 8000) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}\n…（已截断）`;
}

function sanitizeTags(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n，、]/)
      : [];
  return Array.from(
    new Set(
      list
        .map((item) => String(item || "").trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 8),
    ),
  );
}

function sanitizeReasoningEffort(value, fallback = "medium") {
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
  return "medium";
}

function extractChatLikeText(data) {
  const choice = data?.choices?.[0] || {};
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("");
  }
  if (typeof choice?.text === "string") return choice.text;
  return String(data?.output_text || "");
}

function tryParseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // ignore
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function buildFallbackContent({
  contentMarkdown = "",
  sourceExcerpt = "",
  sessionTitle = "",
} = {}) {
  const existing = String(contentMarkdown || "").trim();
  if (existing) return existing;

  const lines = [];
  lines.push(sessionTitle ? `# ${sessionTitle} 笔记` : "# 新笔记");
  lines.push("");
  if (sourceExcerpt) {
    lines.push("## 对话摘录");
    lines.push("");
    lines.push(
      ...String(sourceExcerpt || "")
        .split(/\r?\n/)
        .map((line) => `> ${line}`),
    );
    lines.push("");
  }
  lines.push("## 核心要点");
  lines.push("");
  lines.push("- ");
  lines.push("");
  lines.push("## 我的理解");
  lines.push("");
  return lines.join("\n");
}

function normalizeAiDraftResult(parsed, fallbackContent) {
  const safe = parsed && typeof parsed === "object" ? parsed : {};
  const contentMarkdown = String(safe.contentMarkdown || "").trim() || fallbackContent;
  const summary = clipText(String(safe.summary || "").trim(), 400);
  const tags = sanitizeTags(safe.tags);
  return {
    contentMarkdown,
    summary,
    tags,
  };
}

export async function generateNoteAiDraft(
  deps,
  {
    contentMarkdown = "",
    sourceExcerpt = "",
    messageText = "",
    sessionTitle = "",
  } = {},
) {
  const {
    getResolvedAgentRuntimeConfig,
    getProviderByAgent,
    getModelByAgent,
    resolveRequestProtocol,
    getProviderConfig,
    buildProviderHeaders,
    sendProviderRequestWithRetry,
    formatProviderUpstreamError,
    safeReadText,
    safeReadJson,
    extractResponsesOutputTextFromCompleted,
    buildAliyunChatPayload,
    buildAliyunDashScopePayload,
  } = deps;

  const runtimeConfig = await getResolvedAgentRuntimeConfig("A");
  const provider = getProviderByAgent("A", runtimeConfig);
  const model = getModelByAgent("A", runtimeConfig);
  const protocol = resolveRequestProtocol(runtimeConfig?.protocol, provider, model).value;
  const providerConfig = getProviderConfig(provider);
  const endpoint =
    protocol === "responses" ? providerConfig.responsesEndpoint : providerConfig.chatEndpoint;

  if (!endpoint || !providerConfig.apiKey) {
    throw new Error("笔记 AI 模型未配置完成。");
  }

  const clippedMarkdown = clipText(contentMarkdown, 10000);
  const clippedExcerpt = clipText(sourceExcerpt, 4000);
  const clippedMessage = clipText(messageText, 6000);
  const clippedSessionTitle = clipText(sessionTitle, 120);
  const fallbackContent = buildFallbackContent({
    contentMarkdown: clippedMarkdown,
    sourceExcerpt: clippedExcerpt || clippedMessage,
    sessionTitle: clippedSessionTitle,
  });

  const systemPrompt =
    "你是学习笔记整理助手。请把现有笔记或对话摘录整理成清晰、简洁、可继续编辑的 Markdown 学习笔记，并输出一个 JSON 对象。不要输出解释文本，不要输出 Markdown 代码块围栏。";
  const userPrompt = [
    "请输出 JSON，格式如下：",
    '{"contentMarkdown":"...","summary":"...","tags":["标签1","标签2"]}',
    "要求：",
    "1. contentMarkdown 必须是可直接编辑的 Markdown；",
    "2. summary 用 1-2 句话概括；",
    "3. tags 返回 1-5 个简短中文标签；",
    "4. 不要虚构未出现的事实；",
    "5. 如果已有 Markdown，可在其基础上重整结构，而不是丢弃重点。",
    clippedSessionTitle ? `会话标题：${clippedSessionTitle}` : "会话标题：无",
    clippedExcerpt ? `摘录内容：\n${clippedExcerpt}` : "摘录内容：无",
    clippedMessage ? `原始消息：\n${clippedMessage}` : "原始消息：无",
    clippedMarkdown ? `现有笔记：\n${clippedMarkdown}` : "现有笔记：无",
  ].join("\n\n");

  let payload = null;
  if (provider === "aliyun" && protocol === "dashscope") {
    payload = buildAliyunDashScopePayload({
      model,
      messages: [{ role: "user", content: userPrompt }],
      systemPrompt,
      config: { maxOutputTokens: 1600 },
      thinkingEnabled: false,
      webSearchRuntime: null,
      temperature: 0.2,
      topP: 0.9,
    });
  } else if (provider === "aliyun") {
    payload = buildAliyunChatPayload({
      model,
      messages: [{ role: "user", content: userPrompt }],
      systemPrompt,
      config: { maxOutputTokens: 1600 },
      thinkingEnabled: false,
      webSearchRuntime: null,
      temperature: 0.2,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
  } else if (protocol === "responses") {
    payload = {
      model,
      stream: false,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      instructions: systemPrompt,
      max_output_tokens: 1600,
      thinking: { type: "disabled" },
    };
  } else {
    payload = {
      model,
      stream: false,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    if (provider === "packycode") {
      if (runtimeConfig?.enableThinking !== false) {
        payload.reasoning = {
          effort: sanitizeReasoningEffort(runtimeConfig?.thinkingEffort, "medium"),
        };
      }
    } else {
      payload.temperature = 0.2;
      payload.top_p = 0.9;
    }
  }

  const upstream = await sendProviderRequestWithRetry({
    endpoint,
    headers: buildProviderHeaders(provider, providerConfig.apiKey, protocol),
    body: JSON.stringify(payload),
    provider,
    protocol,
  });

  if (!upstream.ok) {
    const detail = await safeReadText(upstream);
    throw new Error(
      formatProviderUpstreamError(provider, protocol, upstream.status, detail),
    );
  }

  const data = await safeReadJson(upstream);
  const rawText =
    protocol === "responses"
      ? extractResponsesOutputTextFromCompleted(data)
      : extractChatLikeText(data);
  const parsed = tryParseJson(rawText);
  return normalizeAiDraftResult(parsed, fallbackContent);
}
