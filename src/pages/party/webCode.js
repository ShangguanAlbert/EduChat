const VOID_HTML_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const BLOCKED_PREVIEW_TAGS = new Set(["script", "iframe", "object", "embed", "form", "base"]);
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "poster"]);

function analyzeHtml(html) {
  const diagnostics = [];
  const stack = [];
  const source = String(html || "");
  const tagPattern = /<!--[^]*?-->|<![^>]*>|<\/?([A-Za-z][\w:-]*)\b[^>]*>/g;
  let match = tagPattern.exec(source);
  while (match) {
    const raw = match[0];
    const tagName = String(match[1] || "").toLowerCase();
    if (!tagName || raw.startsWith("<!--") || raw.startsWith("<!")) {
      match = tagPattern.exec(source);
      continue;
    }
    if (raw.startsWith("</")) {
      const expected = stack.at(-1);
      if (!expected) {
        diagnostics.push(`HTML 中存在多余的 </${tagName}>。`);
      } else if (expected !== tagName) {
        diagnostics.push(`HTML 标签顺序可能有误：当前应先闭合 </${expected}>。`);
        const matchingIndex = stack.lastIndexOf(tagName);
        if (matchingIndex >= 0) stack.splice(matchingIndex, 1);
      } else {
        stack.pop();
      }
    } else if (!VOID_HTML_TAGS.has(tagName) && !raw.endsWith("/>")) {
      stack.push(tagName);
    }
    if (diagnostics.length >= 10) break;
    match = tagPattern.exec(source);
  }
  stack.slice(-5).reverse().forEach((tagName) => {
    diagnostics.push(`HTML 标签 <${tagName}> 尚未闭合。`);
  });
  return diagnostics;
}

function analyzeCss(css) {
  const diagnostics = [];
  const source = String(css || "").replace(/\/\*[^]*?\*\//g, "");
  let depth = 0;
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) {
      diagnostics.push("CSS 中存在多余的右花括号 }。");
      depth = 0;
    }
  }
  if (quote) diagnostics.push("CSS 中存在未闭合的引号。");
  if (depth > 0) diagnostics.push(`CSS 中有 ${depth} 个样式块尚未闭合。`);
  return diagnostics;
}

export function analyzeWebCode(html, css) {
  return [...analyzeHtml(html), ...analyzeCss(css)].slice(0, 20);
}

function isUnsafeUrl(value) {
  return /^\s*(javascript|vbscript):/i.test(String(value || ""));
}

function sanitizePreviewHtml(html) {
  const source = String(html || "");
  if (typeof DOMParser === "undefined") {
    return source
      .replace(/<script\b[^>]*>[^]*?<\/script\s*>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\b(javascript|vbscript):/gi, "");
  }
  const parsed = new DOMParser().parseFromString(source, "text/html");
  parsed.querySelectorAll(Array.from(BLOCKED_PREVIEW_TAGS).join(",")).forEach((element) => element.remove());
  parsed.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || (URL_ATTRIBUTES.has(name) && isUnsafeUrl(attribute.value))) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return parsed.body.innerHTML;
}

function escapeStyleEndTag(css) {
  return String(css || "").replace(/<\/style/gi, "<\\/style");
}

export function buildSafePreviewDocument(html, css) {
  const safeHtml = sanitizePreviewHtml(html);
  const safeCss = escapeStyleEndTag(css);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; font-src https: data:; style-src 'unsafe-inline' https:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
  <style>${safeCss}</style>
</head>
<body>${safeHtml}</body>
</html>`;
}

export function buildDownloadDocument(html, css) {
  const source = String(html || "");
  const style = `<style>\n${escapeStyleEndTag(css)}\n</style>`;
  if (/<\/head\s*>/i.test(source)) return source.replace(/<\/head\s*>/i, `${style}\n</head>`);
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8" />\n${style}\n</head>\n<body>\n${source}\n</body>\n</html>\n`;
}
