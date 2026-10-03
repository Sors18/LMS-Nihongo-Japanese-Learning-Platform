import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mockPekoraReply,
  ensurePekoTail,
  normalizeHistory,
  buildGeminiChatBody,
  buildVideoContextBlock,
  extractGeminiText,
  VIDEO_SUGGESTIONS,
  openPekoraWithVideo,
  PEKORA_SYSTEM_PROMPT,
} from "../lib/pekora";

describe("pekora", () => {
  it("system prompt giữ vai Pekora", () => {
    assert.match(PEKORA_SYSTEM_PROMPT, /Pekora/);
    assert.match(PEKORA_SYSTEM_PROMPT, /peko/);
  });

  it("mock: ngữ pháp ~てる", () => {
    const r = mockPekoraReply("Giải thích ngữ pháp ~てる");
    assert.match(r, /てる/);
    assert.match(r, /peko/);
    assert.match(r, /🐰/);
  });

  it("mock: dịch câu", () => {
    const r = mockPekoraReply("Dịch câu này giúp mình");
    assert.match(r, /peko/);
  });

  it("mock: kanji 今日", () => {
    const r = mockPekoraReply("Kanji 今日 đọc sao?");
    assert.match(r, /きょう/);
  });

  it("mock: chào hỏi", () => {
    const r = mockPekoraReply("xin chào pekora");
    assert.match(r, /Konpeko/);
  });

  it("mock: cảm ơn", () => {
    const r = mockPekoraReply("cảm ơn nhiều");
    assert.match(r, /どういたしまして/);
  });

  it("mock: generic luôn có peko + 🐰 + echo câu hỏi", () => {
    for (let i = 0; i < 10; i++) {
      const r = mockPekoraReply(`câu hỏi lạ ${i} xyz`);
      assert.match(r, /peko/);
      assert.match(r, /🐰/);
    }
  });

  it("ensurePekoTail: thêm peko + thỏ khi thiếu", () => {
    assert.equal(ensurePekoTail("Xin chào"), "Xin chào peko~ 🐰");
    assert.match(ensurePekoTail("Hay peko!"), /🐰/);
    assert.match(ensurePekoTail("Hay 🐰"), /peko|🐰/);
    assert.match(ensurePekoTail(""), /peko/);
  });

  it("normalizeHistory: cắt 10, map role, cắt dài", () => {
    const h = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `msg ${i} ` + "x".repeat(5000),
    }));
    const out = normalizeHistory(h);
    assert.equal(out.length, 10);
    assert.ok(out.every((m) => m.content.length <= 2000));
    assert.equal(out[0].content.slice(0, 5), "msg 5");
  });

  it("buildGeminiChatBody: systemInstruction + contents, assistant→model", () => {
    const body = buildGeminiChatBody("Chào", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Konpeko peko! 🐰" },
    ]);
    assert.match(JSON.stringify(body.systemInstruction), /Pekora/);
    assert.equal(body.contents.length, 3);
    assert.equal(body.contents[1].role, "model");
    assert.equal(body.contents[2].role, "user");
    assert.equal(body.generationConfig.temperature, 0.85);
  });

  it("extractGeminiText: trích parts text", () => {
    const json = { candidates: [{ content: { parts: [{ text: "Konpeko " }, { text: "peko! 🐰" }] } }] };
    assert.equal(extractGeminiText(json), "Konpeko peko! 🐰");
    assert.equal(extractGeminiText({}), null);
    assert.equal(extractGeminiText({ candidates: [] }), null);
  });

  it("buildVideoContextBlock: rỗng khi không có video", () => {
    assert.equal(buildVideoContextBlock(null), "");
    assert.equal(buildVideoContextBlock(undefined), "");
    assert.equal(buildVideoContextBlock({ id: 0, title: "", level: "N4", subtitles: [] }), "");
  });

  it("buildVideoContextBlock: có title + level + phụ đề", () => {
    const b = buildVideoContextBlock({ id: 1, title: "YOASOBI", level: "N3", subtitles: ["こんにちは", "ありがとう"] });
    assert.match(b, /YOASOBI/);
    assert.match(b, /N3/);
    assert.match(b, /こんにちは/);
    assert.match(b, /peko/);
  });

  it("buildVideoContextBlock: cắt tối đa 60 dòng / 3000 ký tự", () => {
    const subs = Array.from({ length: 200 }, (_, i) => `câu số ${i} ` + "あ".repeat(100));
    const b = buildVideoContextBlock({ id: 1, title: "Dài", level: "N5", subtitles: subs });
    assert.ok(b.length < 4000);
    assert.ok(!b.includes("câu số 199"));
  });

  it("buildGeminiChatBody: kèm video context vào system", () => {
    const body = buildGeminiChatBody("Video này nói về gì?", [], {
      id: 2,
      title: "Test Video",
      level: "N4",
      subtitles: ["今日はいい天気"],
    });
    assert.match(JSON.stringify(body.systemInstruction), /Test Video/);
    assert.match(JSON.stringify(body.systemInstruction), /今日はいい天気/);
  });

  it("mock: có videoTitle → trả lời gắn với video", () => {
    const r = mockPekoraReply("câu hỏi lạ xyz không khớp nhánh", "Video Hay");
    assert.match(r, /Video Hay/);
    assert.match(r, /peko/);
  });

  it("VIDEO_SUGGESTIONS: 4 câu hỏi mặc định về video", () => {
    assert.equal(VIDEO_SUGGESTIONS.length, 4);
    assert.ok(VIDEO_SUGGESTIONS.some((q) => q.includes("nói về gì")));
    assert.ok(VIDEO_SUGGESTIONS.some((q) => q.includes("nhân vật")));
    assert.ok(VIDEO_SUGGESTIONS.every((q) => typeof q === "string" && q.length > 0));
  });

  it("openPekoraWithVideo: không window → không throw", () => {
    assert.doesNotThrow(() => openPekoraWithVideo({ id: 1, title: "X" }));
    assert.doesNotThrow(() => openPekoraWithVideo({ id: -1, title: "X" }));
  });
});
