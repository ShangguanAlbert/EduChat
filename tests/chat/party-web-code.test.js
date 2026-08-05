import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeWebCode,
  buildDownloadDocument,
  buildSafePreviewDocument,
} from "../../src/pages/party/webCode.js";

test("analyzeWebCode reports unclosed HTML and CSS blocks", () => {
  const diagnostics = analyzeWebCode("<main><h1>标题</main>", ".card { color: red;");
  assert.ok(diagnostics.some((item) => item.includes("h1")));
  assert.ok(diagnostics.some((item) => item.includes("样式块")));
});

test("buildSafePreviewDocument disables scripts and dangerous event handlers", () => {
  const document = buildSafePreviewDocument(
    '<button onclick="alert(1)">测试</button><script>alert(2)</script>',
    "button { color: red; }",
  );
  assert.doesNotMatch(document, /<script/i);
  assert.doesNotMatch(document, /onclick=/i);
  assert.match(document, /Content-Security-Policy/);
  assert.match(document, /script-src|default-src 'none'/);
});

test("buildDownloadDocument combines HTML and CSS into one portable page", () => {
  const document = buildDownloadDocument("<main>作品</main>", "main { color: blue; }");
  assert.match(document, /<style>/);
  assert.match(document, /main \{ color: blue; \}/);
  assert.match(document, /<main>作品<\/main>/);
});
