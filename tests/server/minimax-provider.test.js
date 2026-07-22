import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMiniMaxProviderConfig,
  formatMiniMaxUpstreamError,
} from "../../server/providers/minimax/index.js";
import { buildMiniMaxMusicRequest } from "../../server/modules/music/services/generate.js";
import { buildMiniMaxLyricsRequest } from "../../server/modules/music/services/lyrics.js";

const musicDepsDouble = {
  sanitizeText(value, fallback = "", maxLength = 2000) {
    const text = String(value ?? fallback).trim();
    return text.slice(0, maxLength);
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
  sanitizeGroupChatFileName(value) {
    return String(value || "").trim();
  },
  normalizeGeneratedMusicFormat(value) {
    const format = String(value || "").trim().toLowerCase();
    return format || "mp3";
  },
};

test("buildMiniMaxProviderConfig reads defaults and api key", () => {
  const config = buildMiniMaxProviderConfig({
    env: {
      MINIMAX_API_KEY: "mm-key",
    },
  });

  assert.equal(config.apiKey, "mm-key");
  assert.equal(config.chatEndpoint, undefined);
  assert.equal(
    config.musicEndpoint,
    "https://api.minimaxi.com/v1/music_generation",
  );
  assert.equal(
    config.lyricsEndpoint,
    "https://api.minimaxi.com/v1/lyrics_generation",
  );
});

test("formatMiniMaxUpstreamError maps common upstream codes to stable Chinese messages", () => {
  assert.equal(
    formatMiniMaxUpstreamError({ status: 401, code: "1004" }),
    "MiniMax 认证失败：请检查 MINIMAX_API_KEY 是否正确且仍有效。",
  );
  assert.equal(
    formatMiniMaxUpstreamError({ status: 400, code: "1008" }),
    "MiniMax 账号余额不足，请充值后重试。",
  );
  assert.equal(
    formatMiniMaxUpstreamError({ status: 429 }),
    "MiniMax 当前请求过于频繁，请稍后再试。",
  );
});

test("buildMiniMaxMusicRequest validates compose and cover modes", () => {
  const instrumental = buildMiniMaxMusicRequest(
    {
      model: "music-2.6-free",
      prompt: "温暖木吉他与钢琴",
      isInstrumental: true,
    },
    musicDepsDouble,
  );

  assert.equal(instrumental.meta.generationType, "compose");
  assert.equal(instrumental.payload.is_instrumental, true);
  assert.equal(instrumental.payload.audio_setting.format, "mp3");
  assert.equal(instrumental.meta.sampleRate, 44100);

  const cover = buildMiniMaxMusicRequest(
    {
      model: "music-cover-free",
      prompt: "女声流行翻唱",
      lyrics: "这是一段可选歌词",
    },
    musicDepsDouble,
    {
      referenceAudioFile: {
        originalname: "demo.mp3",
        mimetype: "audio/mpeg",
        size: 4,
        buffer: Buffer.from([1, 2, 3, 4]),
      },
    },
  );
  assert.equal(cover.meta.generationType, "cover");
  assert.equal(cover.meta.referenceAudioFileName, "demo.mp3");
  assert.equal(typeof cover.payload.audio_base64, "string");

  assert.throws(
    () =>
      buildMiniMaxMusicRequest(
        {
          model: "music-cover",
          prompt: "男声翻唱",
        },
        musicDepsDouble,
      ),
    /需要上传参考音频/,
  );
});

test("buildMiniMaxLyricsRequest validates write and edit modes", () => {
  const writeFullSong = buildMiniMaxLyricsRequest(
    {
      mode: "write_full_song",
      prompt: "毕业季、抒情、钢琴",
      title: "我们的夏天",
    },
    musicDepsDouble,
  );
  assert.equal(writeFullSong.payload.mode, "write_full_song");
  assert.equal(writeFullSong.payload.title, "我们的夏天");

  const edit = buildMiniMaxLyricsRequest(
    {
      mode: "edit",
      prompt: "续写副歌",
      lyrics: "原歌词",
    },
    musicDepsDouble,
  );
  assert.equal(edit.payload.mode, "edit");
  assert.equal(edit.payload.lyrics, "原歌词");

  assert.throws(
    () =>
      buildMiniMaxLyricsRequest(
        {
          mode: "edit",
          prompt: "继续写",
          lyrics: "",
        },
        musicDepsDouble,
      ),
    /需要填写原歌词/,
  );
});
