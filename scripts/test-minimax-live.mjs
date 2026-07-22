import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";

loadEnv();

const serverOrigin = process.env.TEST_SERVER_ORIGIN || "http://localhost:8787";
const rawBasePath = String(process.env.EDUCHAT_BASE_PATH || "").trim();
const serverBaseUrl = `${serverOrigin}${rawBasePath}`.replace(/\/$/, "");

function createJsonHeaders(token = "") {
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function safeReadText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

async function parseJsonResponse(resp) {
  const text = await safeReadText(resp);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(pathname, { method = "GET", token = "", body, headers = {} } = {}) {
  const resp = await fetch(`${serverBaseUrl}${pathname}`, {
    method,
    headers: {
      ...createJsonHeaders(token),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const data = await parseJsonResponse(resp);
  if (!resp.ok) {
    throw new Error(
      `HTTP ${resp.status} ${pathname}: ${String(data?.error || data?.raw || resp.statusText || "请求失败")}`,
    );
  }
  return data;
}

function createTempAccount() {
  const suffix = Date.now().toString(36);
  return {
    username: `live_minimax_${suffix}`,
    password: `LiveTest-${suffix}-Pass123`,
  };
}

async function registerAndLogin() {
  const account = createTempAccount();
  const registerData = await requestJson("/api/auth/register", {
    method: "POST",
    body: account,
  });
  assert.equal(registerData?.ok, true, "注册接口未返回 ok=true。");

  const loginData = await requestJson("/api/auth/login", {
    method: "POST",
    body: {
      ...account,
      teacherScopeKey: "",
    },
  });
  assert.equal(loginData?.ok, true, "登录接口未返回 ok=true。");
  assert.ok(loginData?.token, "登录接口未返回 token。");

  return {
    account,
    token: String(loginData.token),
    userId: String(loginData?.user?._id || ""),
  };
}

async function testMusicRoutes(token) {
  const before = await requestJson("/api/music/history", { token });
  const beforeCount = Array.isArray(before?.items) ? before.items.length : 0;

  const generated = await requestJson("/api/music/generate", {
    method: "POST",
    token,
    body: {
      model: "music-2.6-free",
      prompt: "温暖木吉他，校园清晨，舒缓纯音乐，30秒左右",
      lyrics: "",
      isInstrumental: true,
      lyricsOptimizer: false,
      format: "mp3",
      sampleRate: 44100,
      bitrate: 128000,
    },
  });

  assert.equal(generated?.ok, true, "音乐生成接口未返回 ok=true。");
  const item = generated?.item || {};
  const musicId = String(item?._id || item?.id || "");
  assert.ok(musicId, "音乐生成接口未返回历史记录 ID。");

  const history = await requestJson("/api/music/history", { token });
  const historyItems = Array.isArray(history?.items) ? history.items : [];
  const createdItem = historyItems.find((entry) => String(entry?._id || entry?.id || "") === musicId);
  assert.ok(createdItem, "音乐历史列表中未找到刚生成的记录。");
  assert.equal(createdItem?.hasOssBackup, true, "音乐历史记录未标记 OSS 备份。");

  const linkData = await requestJson(
    `/api/music/history/${encodeURIComponent(musicId)}/download-link`,
    { token },
  );
  assert.equal(linkData?.ok, true, "音乐 30 天下载链接接口未返回 ok=true。");
  assert.ok(String(linkData?.downloadUrl || "").startsWith("http"), "音乐 30 天下载链接无效。");

  const contentResp = await fetch(`${serverBaseUrl}/api/music/history/${musicId}/content`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(180000),
  });
  if (!contentResp.ok) {
    const text = await safeReadText(contentResp);
    throw new Error(`音乐内容下载失败 (${contentResp.status}): ${text || contentResp.statusText}`);
  }
  const audioBuffer = Buffer.from(await contentResp.arrayBuffer());

  const deleted = await requestJson(`/api/music/history/${musicId}`, {
    method: "DELETE",
    token,
  });
  assert.equal(deleted?.ok, true, "删除音乐历史接口未返回 ok=true。");

  const after = await requestJson("/api/music/history", { token });
  const afterCount = Array.isArray(after?.items) ? after.items.length : 0;

  return {
    beforeCount,
    afterCount,
    musicId,
    model: String(createdItem?.model || item?.model || ""),
    format: String(createdItem?.format || item?.format || ""),
    audioSize: Number(createdItem?.audioSize || item?.audioSize || audioBuffer.length || 0),
    downloadBytes: audioBuffer.length,
    durationMs: Number(createdItem?.durationMs || item?.durationMs || 0),
    hasOssBackup: !!createdItem?.hasOssBackup,
    downloadLinkExpiresAt: String(linkData?.expiresAt || ""),
  };
}

async function main() {
  assert.ok(process.env.MINIMAX_API_KEY, "缺少 MINIMAX_API_KEY，无法执行真实链路测试。");
  assert.ok(process.env.MINIMAX_MUSIC_ENDPOINT, "缺少 MINIMAX_MUSIC_ENDPOINT，无法执行真实链路测试。");

  console.log(`🔗 Server base: ${serverBaseUrl}`);
  console.log("🧪 开始真实 MiniMax 平台链路测试...");

  const { account, token } = await registerAndLogin();
  console.log(`✅ 注册并登录测试账号成功: ${account.username}`);

  const music = await testMusicRoutes(token);
  console.log("✅ /api/music/* 成功");
  console.log(JSON.stringify(music, null, 2));

  console.log("🎉 真实 MiniMax 平台链路测试完成。");
}

main().catch((error) => {
  console.error("❌ 真实 MiniMax 平台链路测试失败");
  console.error(error);
  process.exitCode = 1;
});
