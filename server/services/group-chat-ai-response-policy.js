const SOCRATIC_CODE_POLICY_FALLBACK =
  "这段内容已经接近完整作品了。我们先停在当前检查点：你们能说明最关键的一处结构或样式选择，以及准备如何通过网页预览验证吗？我会根据你们的判断继续给下一小步。";

const CODE_FENCE_BLOCK_PATTERN = /```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g;
const CODE_STATEMENT_PATTERN =
  /^\s*(?:async\s+def|def|class|from\s+\S+\s+import|import\s+\S+|for\s+.+\s+in\s+|while\s+|if\s+.+:|elif\s+.+:|else\s*:|try\s*:|except\b|with\s+.+\s+as\s+|return\b|yield\b|pass\b|break\b|continue\b|[A-Za-z_]\w*\s*(?:[+\-*/%]?=)|(?:print|input|len|sum|range|type|list|dict|set|str|int|float|open|enumerate|zip|sorted)\s*\()/;

export function isGroupChatAiCompleteSolutionOutput(content) {
  const text = String(content || "").trim();
  if (!text) return false;
  const fencedBlocks = Array.from(text.matchAll(CODE_FENCE_BLOCK_PATTERN));
  if (
    fencedBlocks.some(
      (block) =>
        String(block[1] || "")
          .split(/\r?\n/)
          .filter((line) => line.trim()).length >= 3,
    )
  ) {
    return true;
  }
  const statementCount = text
    .split(/\r?\n/)
    .filter((line) => CODE_STATEMENT_PATTERN.test(line)).length;
  return statementCount >= 3;
}

export function enforceGroupChatAiSocraticResponse(content) {
  const text = String(content || "").trim();
  if (!text || isGroupChatAiCompleteSolutionOutput(text)) {
    return SOCRATIC_CODE_POLICY_FALLBACK;
  }
  return text;
}

function splitLongBubble(text, maxChars) {
  if (text.length <= maxChars || text.includes("```")) return [text];
  const sentences = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) || [text];
  const chunks = [];
  let current = "";
  sentences.forEach((sentence) => {
    const next = `${current}${sentence}`.trim();
    if (current && next.length > maxChars) {
      chunks.push(current.trim());
      current = sentence.trim();
    } else {
      current = next;
    }
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function splitGroupChatAiResponseBubbles(
  content,
  { maxBubbleChars = 360, maxBubbles = 8 } = {},
) {
  const text = String(content || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const blocks = [];
  let currentLines = [];
  let inCodeFence = false;
  const flush = () => {
    const block = currentLines.join("\n").trim();
    if (block) blocks.push(block);
    currentLines = [];
  };

  text.split("\n").forEach((line) => {
    if (line.trim().startsWith("```")) inCodeFence = !inCodeFence;
    if (!inCodeFence && !line.trim()) {
      flush();
      return;
    }
    currentLines.push(line);
  });
  flush();

  const expanded = blocks.flatMap((block) => splitLongBubble(block, maxBubbleChars));
  if (expanded.length <= maxBubbles) return expanded;
  return [
    ...expanded.slice(0, maxBubbles - 1),
    expanded.slice(maxBubbles - 1).join("\n\n"),
  ];
}
