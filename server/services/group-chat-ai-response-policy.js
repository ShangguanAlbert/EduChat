const SOCRATIC_CODE_POLICY_FALLBACK =
  "这段内容已经接近完整解法了。我们先停在当前这个检查点：你能说明其中每一步各自要验证什么，以及准备如何用自己的测试数据确认吗？我会根据你的回答继续给下一小步。";

const CODE_FENCE_BLOCK_PATTERN = /```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g;
const PYTHON_STATEMENT_PATTERN =
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
    .filter((line) => PYTHON_STATEMENT_PATTERN.test(line)).length;
  return statementCount >= 3;
}

export function enforceGroupChatAiSocraticResponse(content) {
  const text = String(content || "").trim();
  if (!text || isGroupChatAiCompleteSolutionOutput(text)) {
    return SOCRATIC_CODE_POLICY_FALLBACK;
  }
  return text;
}
