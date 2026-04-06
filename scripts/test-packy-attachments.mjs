import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "https://www.packyapi.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_IMAGE_URL = "https://placehold.co/64x64/png";
const DEFAULT_TEXT_FILE_DATA =
  "data:text/plain;base64,SGVsbG8gUGFja3kgRmlsZQ==";

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
    text:
      json?.choices?.[0]?.message?.content ||
      json?.output_text ||
      json?.error?.message ||
      rawText,
  };
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadDotEnv(path.join(repoRoot, ".env"));

  const apiKey = pickEnv("PACKYCODE_API_KEY");
  const endpoint = pickEnv("PACKYCODE_CHAT_ENDPOINT", DEFAULT_ENDPOINT);
  const model = pickEnv("PACKYCODE_TEST_MODEL", DEFAULT_MODEL);
  const imageUrl = pickEnv("PACKYCODE_TEST_IMAGE_URL", DEFAULT_IMAGE_URL);
  const textFileData = pickEnv(
    "PACKYCODE_TEST_TEXT_FILE_DATA",
    DEFAULT_TEXT_FILE_DATA,
  );

  if (isPlaceholderApiKey(apiKey)) {
    console.error("PACKYCODE_API_KEY 未配置或仍是占位符，无法测试。");
    process.exitCode = 1;
    return;
  }

  const probes = [
    {
      name: "image_native_shape",
      body: {
        model,
        stream: false,
        max_tokens: 128,
        reasoning: { effort: "medium" },
        messages: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Describe the image briefly." },
              { type: "input_image", image_url: imageUrl },
            ],
          },
        ],
      },
    },
    {
      name: "file_native_shape",
      body: {
        model,
        stream: false,
        max_tokens: 128,
        reasoning: { effort: "medium" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Please repeat the content you received from the attachment.",
              },
              {
                type: "input_file",
                filename: "hello.txt",
                file_data: textFileData,
              },
            ],
          },
        ],
      },
    },
  ];

  printHeader("Packy Attachments Probe");
  console.log(`endpoint: ${endpoint}`);
  console.log(`model: ${model}`);

  const results = [];
  for (const probe of probes) {
    results.push({
      name: probe.name,
      ...(await sendProbe({
        endpoint,
        apiKey,
        body: probe.body,
      })),
    });
  }

  printHeader("Results");
  results.forEach((item) => {
    console.log(
      [
        `${item.ok ? "✅" : "❌"} ${item.name}`,
        `status=${item.status}`,
        `reply=${JSON.stringify(String(item.text || "").slice(0, 180))}`,
      ].join(" | "),
    );
  });

  const failed = results.filter((item) => !item.ok);
  printHeader("Summary");
  if (failed.length > 0) {
    console.log(`结论：有 ${failed.length} 个附件探测失败，请检查上游兼容性或输入素材。`);
    process.exitCode = 1;
    return;
  }

  console.log("结论：PackyCode 当前接受图片与文件附件的原生输入形态。");
}

main().catch((error) => {
  console.error("脚本执行失败：", error?.message || error);
  process.exitCode = 1;
});
