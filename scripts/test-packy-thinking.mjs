import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "https://www.packyapi.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5.4";

function loadDotEnv(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) return;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!key || process.env[key]) return;
      process.env[key] = value;
    });
  } catch {
    // noop
  }
}

function isPlaceholderApiKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return true;
  if (key.startsWith("your_") && key.includes("api_key")) return true;
  if (key.includes("replace_me")) return true;
  if (key.includes("your-api-key")) return true;
  if (key.includes("xxxx")) return true;
  return false;
}

function pickEnv(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

async function sendProbe({ endpoint, apiKey, model, effort = null }) {
  const body = {
    model,
    stream: false,
    messages: [
      {
        role: "system",
        content: "You are a concise assistant.",
      },
      {
        role: "user",
        content: "Reply with exactly: PACKY_OK",
      },
    ],
    max_tokens: 128,
  };

  if (effort) {
    body.reasoning = { effort };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let json = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = null;
  }

  const content =
    json?.choices?.[0]?.message?.content ||
    json?.output_text ||
    json?.error?.message ||
    "";

  return {
    effort: effort || "none",
    ok: response.ok,
    status: response.status,
    content,
    rawText,
    json,
  };
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadDotEnv(path.join(repoRoot, ".env"));

  const apiKey = pickEnv("PACKYCODE_API_KEY");
  const endpoint = pickEnv("PACKYCODE_CHAT_ENDPOINT", DEFAULT_ENDPOINT);
  const model = pickEnv("PACKYCODE_TEST_MODEL", DEFAULT_MODEL);
  const efforts = ["low", "medium", "high"];

  if (isPlaceholderApiKey(apiKey)) {
    console.error("PACKYCODE_API_KEY 未配置或仍是占位符，无法测试。");
    process.exitCode = 1;
    return;
  }

  printHeader("Packy Thinking Probe");
  console.log(`endpoint: ${endpoint}`);
  console.log(`model: ${model}`);

  const results = [];
  results.push(await sendProbe({ endpoint, apiKey, model, effort: null }));
  for (const effort of efforts) {
    results.push(await sendProbe({ endpoint, apiKey, model, effort }));
  }

  printHeader("Results");
  results.forEach((item) => {
    const passed = item.ok && item.content.includes("PACKY_OK");
    console.log(
      [
        `${passed ? "✅" : "❌"} effort=${item.effort}`,
        `status=${item.status}`,
        `reply=${JSON.stringify(item.content || item.rawText.slice(0, 120))}`,
      ].join(" | "),
    );
  });

  const baseline = results.find((item) => item.effort === "none");
  const supportedEfforts = results
    .filter((item) => item.effort !== "none" && item.ok)
    .map((item) => item.effort);

  printHeader("Summary");
  if (!baseline?.ok) {
    console.log("基线请求失败：先检查 PackyCode endpoint / key / model 是否可用。");
    process.exitCode = 1;
    return;
  }

  if (supportedEfforts.length === 0) {
    console.log("结论：该模型当前未表现出 reasoning 参数支持，或 Packy 兼容层未透传该能力。");
    return;
  }

  console.log(
    `结论：该模型当前接受 reasoning 参数，已验证成功的 effort: ${supportedEfforts.join(", ")}。`,
  );
}

main().catch((error) => {
  console.error("脚本执行失败：", error?.message || error);
  process.exitCode = 1;
});
