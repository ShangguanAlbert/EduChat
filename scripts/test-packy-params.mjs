import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "https://www.packyapi.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_IMAGE_URL = "https://placehold.co/64x64/png";

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

function extractAssistantMessage(json) {
  return json?.choices?.[0]?.message || null;
}

function extractAssistantText(json, rawText = "") {
  const message = extractAssistantMessage(json);
  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        const type = String(part?.type || "")
          .trim()
          .toLowerCase();
        if (type === "text" || type === "output_text" || type === "input_text") {
          return String(part?.text || "");
        }
        return "";
      })
      .join("\n")
      .trim();
    if (text) return text;
  }
  return String(json?.output_text || json?.error?.message || rawText || "").trim();
}

async function sendProbe({ endpoint, apiKey, body }) {
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

  return {
    ok: response.ok,
    status: response.status,
    json,
    rawText,
    text: extractAssistantText(json, rawText),
    message: extractAssistantMessage(json),
  };
}

function classifyProbeResult(probe, response) {
  if (!response.ok) {
    return {
      state: "rejected",
      detail: response.text || response.rawText || "request rejected",
    };
  }

  try {
    const validation = probe.validate?.(response) ?? true;
    if (validation === true) {
      return {
        state: "supported",
        detail: response.text || "accepted",
      };
    }
    if (typeof validation === "string") {
      return {
        state: "accepted_but_inconclusive",
        detail: validation,
      };
    }
  } catch (error) {
    return {
      state: "accepted_but_inconclusive",
      detail: error?.message || "validation failed",
    };
  }

  return {
    state: "accepted_but_inconclusive",
    detail: response.text || "accepted",
  };
}

function buildForcedToolChoiceProbe() {
  return {
    name: "tool_choice",
    note: "测试 chat/completions 是否接受 tools + tool_choice。",
    body: {
      model: DEFAULT_MODEL,
      stream: false,
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: "Call the `echo_status` tool.",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "echo_status",
            description: "Return a simple status object.",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: {
          name: "echo_status",
        },
      },
    },
    validate: (response) => {
      const toolCalls = response?.message?.tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) return true;
      return "请求已接受，但未观察到强制 tool call 返回。";
    },
  };
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadDotEnv(path.join(repoRoot, ".env"));

  const apiKey = pickEnv("PACKYCODE_API_KEY");
  const endpoint = pickEnv("PACKYCODE_CHAT_ENDPOINT", DEFAULT_ENDPOINT);
  const model = pickEnv("PACKYCODE_TEST_MODEL", DEFAULT_MODEL);
  const imageUrl = pickEnv("PACKYCODE_TEST_IMAGE_URL", DEFAULT_IMAGE_URL);

  if (isPlaceholderApiKey(apiKey)) {
    console.error("PACKYCODE_API_KEY 未配置或仍是占位符，无法测试。");
    process.exitCode = 1;
    return;
  }

  const probes = [
    {
      name: "baseline",
      note: "基线请求，确认 endpoint / key / model 可用。",
      body: {
        model,
        stream: false,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: "Reply with exactly: PACKY_BASELINE_OK",
          },
        ],
      },
      validate: (response) =>
        response.text.includes("PACKY_BASELINE_OK") ||
        "请求成功，但返回内容未严格匹配基线文本。",
    },
    {
      name: "reasoning",
      note: "测试 reasoning.effort。",
      body: {
        model,
        stream: false,
        max_tokens: 96,
        reasoning: { effort: "medium" },
        messages: [
          {
            role: "user",
            content: "Reply with exactly: PACKY_REASONING_OK",
          },
        ],
      },
      validate: (response) =>
        response.text.includes("PACKY_REASONING_OK") ||
        "请求成功，但返回内容未严格匹配 reasoning 测试文本。",
    },
    {
      name: "temperature",
      note: "测试 temperature。",
      body: {
        model,
        stream: false,
        max_tokens: 64,
        temperature: 0.2,
        messages: [{ role: "user", content: "Reply with exactly: PACKY_TEMPERATURE_OK" }],
      },
      validate: (response) =>
        response.text.includes("PACKY_TEMPERATURE_OK") ||
        "请求成功，但无法确认 temperature 是否真正生效。",
    },
    {
      name: "top_p",
      note: "测试 top_p。",
      body: {
        model,
        stream: false,
        max_tokens: 64,
        top_p: 0.9,
        messages: [{ role: "user", content: "Reply with exactly: PACKY_TOP_P_OK" }],
      },
      validate: (response) =>
        response.text.includes("PACKY_TOP_P_OK") ||
        "请求成功，但无法确认 top_p 是否真正生效。",
    },
    {
      name: "response_format",
      note: "测试 response_format = json_object。",
      body: {
        model,
        stream: false,
        max_tokens: 128,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: 'Return a compact JSON object exactly like {"status":"ok"}.',
          },
        ],
      },
      validate: (response) => {
        try {
          const parsed = JSON.parse(response.text);
          return parsed?.status === "ok" || "请求成功，但返回内容不是目标 JSON。";
        } catch {
          return "请求成功，但返回内容不是可解析 JSON。";
        }
      },
    },
    {
      name: "store",
      note: "测试 store。",
      body: {
        model,
        stream: false,
        max_tokens: 64,
        store: true,
        messages: [{ role: "user", content: "Reply with exactly: PACKY_STORE_OK" }],
      },
      validate: (response) =>
        response.text.includes("PACKY_STORE_OK") ||
        "请求成功，但无法确认 store 是否真正生效。",
    },
    {
      name: "metadata",
      note: "测试 metadata。",
      body: {
        model,
        stream: false,
        max_tokens: 64,
        metadata: { source: "educhat-packy-probe", model },
        messages: [{ role: "user", content: "Reply with exactly: PACKY_METADATA_OK" }],
      },
      validate: (response) =>
        response.text.includes("PACKY_METADATA_OK") ||
        "请求成功，但无法确认 metadata 是否真正透传。",
    },
    {
      name: "multimodal",
      note: "测试 input_text + input_image。",
      body: {
        model,
        stream: false,
        max_tokens: 128,
        messages: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Describe the image in one short sentence." },
              { type: "input_image", image_url: imageUrl },
            ],
          },
        ],
      },
      validate: (response) =>
        response.text.trim().length > 0 || "请求成功，但未返回可读文本。",
    },
    buildForcedToolChoiceProbe(),
  ].map((probe) => ({
    ...probe,
    body: {
      ...probe.body,
      model,
    },
  }));

  printHeader("Packy Params Probe");
  console.log(`endpoint: ${endpoint}`);
  console.log(`model: ${model}`);

  const results = [];
  for (const probe of probes) {
    const response = await sendProbe({
      endpoint,
      apiKey,
      body: probe.body,
    });
    const classification = classifyProbeResult(probe, response);
    results.push({
      name: probe.name,
      note: probe.note,
      status: response.status,
      state: classification.state,
      detail: classification.detail,
    });
  }

  printHeader("Results");
  results.forEach((item) => {
    const icon =
      item.state === "supported"
        ? "✅"
        : item.state === "accepted_but_inconclusive"
          ? "🟡"
          : "❌";
    console.log(
      [
        `${icon} ${item.name}`,
        `status=${item.status}`,
        `state=${item.state}`,
        `detail=${JSON.stringify(String(item.detail || "").slice(0, 180))}`,
      ].join(" | "),
    );
  });

  const baseline = results.find((item) => item.name === "baseline");
  printHeader("Summary");
  if (!baseline || baseline.state === "rejected") {
    console.log("基线请求失败：请先检查 PackyCode endpoint / key / model 是否可用。");
    process.exitCode = 1;
    return;
  }

  const supported = results
    .filter((item) => item.state === "supported" && item.name !== "baseline")
    .map((item) => item.name);
  const rejected = results
    .filter((item) => item.state === "rejected")
    .map((item) => item.name);
  const inconclusive = results
    .filter((item) => item.state === "accepted_but_inconclusive")
    .map((item) => item.name);

  console.log(`支持：${supported.length > 0 ? supported.join(", ") : "无"}`);
  console.log(`拒绝：${rejected.length > 0 ? rejected.join(", ") : "无"}`);
  console.log(`待人工判断：${inconclusive.length > 0 ? inconclusive.join(", ") : "无"}`);
}

main().catch((error) => {
  console.error("脚本执行失败：", error?.message || error);
  process.exitCode = 1;
});
