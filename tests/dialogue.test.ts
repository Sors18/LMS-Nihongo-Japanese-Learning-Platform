import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitSpeakerSegments } from "../lib/dialogue";

describe("splitSpeakerSegments", () => {
  it("2 câu thoại nửa ngoặc → tách 2 đoạn", () => {
    assert.deepEqual(
      splitSpeakerSegments("(乙骨) 大丈夫？ (悠仁) うん！"),
      ["(乙骨) 大丈夫？", "(悠仁) うん！"]
    );
  });

  it("ngoặc full-width （） cũng tách", () => {
    assert.deepEqual(
      splitSpeakerSegments("（乙骨）大丈夫？（悠仁）うん！"),
      ["（乙骨）大丈夫？", "（悠仁）うん！"]
    );
  });

  it("1 marker đầu dòng = 1 người nói → giữ nguyên", () => {
    const t = "(乙骨) 僕が戦うよ";
    assert.deepEqual(splitSpeakerSegments(t), [t]);
  });

  it("không marker → giữ nguyên", () => {
    const t = "今日は天気がいいですね。";
    assert.deepEqual(splitSpeakerSegments(t), [t]);
  });

  it("text dẫn trước marker đầu giữ làm đoạn mở", () => {
    assert.deepEqual(
      splitSpeakerSegments("回想シーン (乙骨) あの時 (悠仁) そうだね"),
      ["回想シーン", "(乙骨) あの時", "(悠仁) そうだね"]
    );
  });

  it("marker SFX (笑) không tính → không tách", () => {
    const t = "(笑) あはは (笑) えへへ";
    assert.deepEqual(splitSpeakerSegments(t), [t]);
  });

  it("1 tên + 1 SFX → chỉ 1 tên → không tách", () => {
    const t = "(乙骨) 行くぞ (笑)";
    assert.deepEqual(splitSpeakerSegments(t), [t]);
  });

  it("rỗng → mảng rỗng", () => {
    assert.deepEqual(splitSpeakerSegments(""), []);
    assert.deepEqual(splitSpeakerSegments("   "), []);
  });
});
