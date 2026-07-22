import assert from "node:assert/strict";

import { buildMiniMaxProviderConfig, formatMiniMaxUpstreamError } from "../server/providers/minimax/index.js";
import { buildMiniMaxMusicRequest, generateMusicHandler } from "../server/modules/music/services/generate.js";
import {
  clearMusicHistoryHandler,
  deleteMusicHistoryItemHandler,
  getMusicHistoryContentHandler,
  listMusicHistoryHandler,
} from "../server/modules/music/services/history.js";

function createResponseDouble() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    redirectUrl: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function runCase(name, runner) {
  try {
    runner();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

async function runAsyncCase(name, runner) {
  try {
    await runner();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

const depsDouble = {
  sanitizeId(value) {
    return String(value || "").trim();
  },
  sanitizeText(value, fallback = "", maxLength = 2000) {
    return String(value ?? fallback).trim().slice(0, maxLength);
  },
  sanitizeRuntimeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  },
  sanitizeRuntimeInteger(value, fallback, min, max) {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  },
  sanitizeIsoDate(value) {
    return String(value || "").trim();
  },
  sanitizeGroupChatFileName(value) {
    return String(value || "").trim();
  },
  sanitizeGroupChatHttpUrl(value) {
    return String(value || "").trim();
  },
  sanitizeGroupChatOssObjectKey(value) {
    return String(value || "").trim();
  },
  buildGroupChatOssObjectUrl(value) {
    return `https://oss.example.com/${value}`;
  },
  async buildGroupChatFileSignedDownloadUrl({ ossKey }) {
    return `https://oss.example.com/${ossKey}?Expires=1777777777&Signature=test`;
  },
  async uploadBufferToGroupChatOss() {
    return null;
  },
  async deleteGeneratedMusicHistoryOssObjects() {
    return undefined;
  },
  normalizeGeneratedMusicFormat(value) {
    const format = String(value || "").trim().toLowerCase();
    return format || "mp3";
  },
  normalizeGeneratedMusicMimeType(value, format) {
    if (value) return String(value);
    if (format === "wav") return "audio/wav";
    if (format === "pcm") return "audio/L16";
    return "audio/mpeg";
  },
  toGeneratedMusicHistoryItem(doc) {
    return {
      _id: String(doc?._id || ""),
      model: String(doc?.model || ""),
      prompt: String(doc?.prompt || ""),
      lyrics: String(doc?.lyrics || ""),
      isInstrumental: !!doc?.isInstrumental,
      lyricsOptimizer: !!doc?.lyricsOptimizer,
      format: String(doc?.format || ""),
      sampleRate: Number(doc?.sampleRate || 0),
      bitrate: Number(doc?.bitrate || 0),
      durationMs: Number(doc?.durationMs || 0),
      audioSize: Number(doc?.audioSize || 0),
      createdAt: String(doc?.createdAt || ""),
      contentPath: String(doc?.contentPath || ""),
    };
  },
};

runCase("MiniMax 音乐 Provider 默认端点与错误映射正确", () => {
  const config = buildMiniMaxProviderConfig({
    env: {
      MINIMAX_API_KEY: "mm-key",
    },
  });

  assert.equal(config.chatEndpoint, undefined);
  assert.equal(config.musicEndpoint, "https://api.minimaxi.com/v1/music_generation");
  assert.equal(
    formatMiniMaxUpstreamError({ status: 400, code: "1008" }),
    "MiniMax 账号余额不足，请充值后重试。",
  );
});

runCase("音乐请求构建覆盖纯音乐 / 歌词 / 自动歌词模式", () => {
  const instrumental = buildMiniMaxMusicRequest(
    {
      model: "music-2.6-free",
      prompt: "温暖木吉他、校园晨光、舒缓节奏",
      isInstrumental: true,
      format: "wav",
      sampleRate: 32000,
      bitrate: 128000,
    },
    depsDouble,
  );
  assert.equal(instrumental.payload.is_instrumental, true);
  assert.equal(instrumental.payload.audio_setting.format, "mp3");
  assert.equal(instrumental.payload.audio_setting.sample_rate, 44100);
  assert.equal(instrumental.payload.audio_setting.bitrate, 256000);

  const vocal = buildMiniMaxMusicRequest(
    {
      model: "music-2.6",
      prompt: "青春、课堂、希望",
      lyrics: "我们在清晨推开窗，带着微光走向远方",
      isInstrumental: false,
      lyricsOptimizer: false,
    },
    depsDouble,
  );
  assert.equal(vocal.payload.lyrics_optimizer, false);
  assert.equal(vocal.payload.is_instrumental, false);

  const optimizedLyrics = buildMiniMaxMusicRequest(
    {
      model: "music-2.6",
      prompt: "毕业季、抒情、钢琴",
      lyrics: "",
      isInstrumental: false,
      lyricsOptimizer: true,
    },
    depsDouble,
  );
  assert.equal(optimizedLyrics.payload.lyrics_optimizer, true);

  assert.throws(
    () =>
      buildMiniMaxMusicRequest(
        {
          model: "music-2.6",
          prompt: "",
          lyrics: "",
          isInstrumental: false,
          lyricsOptimizer: false,
        },
        depsDouble,
      ),
    /非纯音乐需要填写歌词/,
  );
});

await runAsyncCase("音乐生成 handler 在缺 key 与参数非法时返回明确错误", async () => {
  const noKeyReq = {
    body: {
      model: "music-2.6-free",
      prompt: "test",
      isInstrumental: true,
    },
  };
  const noKeyRes = createResponseDouble();
  await generateMusicHandler(noKeyReq, noKeyRes, {
    ...depsDouble,
    getProviderConfig() {
      return {
        apiKey: "",
        musicEndpoint: "https://api.minimaxi.com/v1/music_generation",
        missingKeyMessage: "未检测到 MiniMax API Key。请在 .env 中配置 MINIMAX_API_KEY。",
      };
    },
  });
  assert.equal(noKeyRes.statusCode, 500);
  assert.match(String(noKeyRes.payload?.error || ""), /MINIMAX_API_KEY/);

  const invalidReq = {
    body: {
      model: "music-2.6-free",
      prompt: "",
      lyrics: "",
      isInstrumental: false,
      lyricsOptimizer: false,
    },
  };
  const invalidRes = createResponseDouble();
  await generateMusicHandler(invalidReq, invalidRes, {
    ...depsDouble,
    getProviderConfig() {
      return {
        apiKey: "mm-key",
        musicEndpoint: "https://api.minimaxi.com/v1/music_generation",
        missingKeyMessage: "",
      };
    },
  });
  assert.equal(invalidRes.statusCode, 400);
  assert.match(String(invalidRes.payload?.error || ""), /非纯音乐需要填写歌词/);
});

await runAsyncCase("音乐历史 handlers 覆盖列表 / 下载 / 删除 / 清空", async () => {
  const reqBase = {
    authUser: { _id: "u1" },
    authStorageUserId: "u1",
    query: { limit: "2" },
    params: { musicId: "m1" },
  };

  const listRes = createResponseDouble();
  await listMusicHistoryHandler(reqBase, listRes, {
    ...depsDouble,
    GeneratedMusicHistory: {
      find() {
        return {
          sort() {
            return this;
          },
          limit() {
            return this;
          },
          lean: async () => [{ _id: "m1", model: "music-2.6", prompt: "校园" }],
        };
      },
    },
  });
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.payload.items[0]._id, "m1");

  const contentRes = createResponseDouble();
  await getMusicHistoryContentHandler(reqBase, contentRes, {
    ...depsDouble,
    GeneratedMusicHistory: {
      findOne() {
        return {
          lean: async () => ({
            format: "mp3",
            audioData: Buffer.from("music"),
            audioMimeType: "audio/mpeg",
            ossKey: "",
          }),
        };
      },
    },
  });
  assert.equal(contentRes.statusCode, 200);
  assert.equal(contentRes.headers["Content-Type"], "audio/mpeg");

  const deleteRes = createResponseDouble();
  const clearRes = createResponseDouble();
  await deleteMusicHistoryItemHandler(reqBase, deleteRes, {
    ...depsDouble,
    GeneratedMusicHistory: {
      findOne() {
        return {
          lean: async () => ({ _id: "m1", ossKey: "music/m1.mp3" }),
        };
      },
      findOneAndDelete: async () => ({ _id: "m1", ossKey: "music/m1.mp3" }),
    },
  });
  await clearMusicHistoryHandler(reqBase, clearRes, {
    ...depsDouble,
    GeneratedMusicHistory: {
      find() {
        return {
          lean: async () => [{ _id: "m1", ossKey: "music/m1.mp3" }],
        };
      },
      deleteMany: async () => ({ deletedCount: 1 }),
    },
  });
  assert.equal(deleteRes.payload.deleted, true);
  assert.equal(clearRes.payload.deletedCount, 1);
});

console.log("\n全部通过：MiniMax 音乐模块脚本检查未发现回归。");
