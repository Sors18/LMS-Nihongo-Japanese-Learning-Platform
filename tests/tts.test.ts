import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ttsKey, ttsPublicUrl } from "../lib/tts";

describe("tts", () => {
  it("ttsKey ổn định 40 hex", () => {
    const k = ttsKey("こんにちは");
    assert.match(k, /^[0-9a-f]{40}$/);
    assert.equal(ttsKey("こんにちは"), k);
  });

  it("text khác nhau → key khác nhau", () => {
    assert.notEqual(ttsKey("こんにちは"), ttsKey("ありがとう"));
  });

  it("lang khác nhau → key khác nhau", () => {
    assert.notEqual(ttsKey("hello", "ja"), ttsKey("hello", "vi"));
  });

  it("ttsPublicUrl đúng format /tts/<sha>.mp3", () => {
    const url = ttsPublicUrl("おはよう");
    assert.match(url, /^\/tts\/[0-9a-f]{40}\.mp3$/);
    assert.equal(url, `/tts/${ttsKey("おはよう")}.mp3`);
  });
});
