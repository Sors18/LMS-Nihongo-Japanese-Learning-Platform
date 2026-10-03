import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasJapanese, pairBilingualLines, splitBilingualCueText, sampleWithTranslation, splitTrailingVietnamese } from "../lib/bilingual";

describe("bilingual", () => {
  it("hasJapanese nhận diện chữ Nhật", () => {
    assert.equal(hasJapanese("だがドルゥヴのように"), true);
    assert.equal(hasJapanese("乙骨"), true);
    assert.equal(hasJapanese("Nhưng không thể để người chơi"), false);
    assert.equal(hasJapanese("konnichiwa"), false);
    assert.equal(hasJapanese(""), false);
  });

  it("ghép cặp JP/VI xen kẽ", () => {
    assert.deepEqual(
      pairBilingualLines([
        "だがドルゥヴのように無差別に人間を襲う泳者を",
        "Nhưng không thể để người chơi",
        "乙骨憂太",
        "Okkotsu Yuta",
      ]),
      [
        { jp: "だがドルゥヴのように無差別に人間を襲う泳者を", vi: "Nhưng không thể để người chơi" },
        { jp: "乙骨憂太", vi: "Okkotsu Yuta" },
      ]
    );
  });

  it("câu JP không có dịch → vi null", () => {
    assert.deepEqual(pairBilingualLines(["こんにちは"]), [{ jp: "こんにちは", vi: null }]);
  });

  it("nhiều dòng VI nối tiếp nhau", () => {
    assert.deepEqual(pairBilingualLines(["こんにちは", "Xin chào", "buổi sáng nhé"]), [
      { jp: "こんにちは", vi: "Xin chào buổi sáng nhé" },
    ]);
  });

  it("dòng VI mồ côi đầu vào → bỏ", () => {
    assert.deepEqual(pairBilingualLines(["Xin chào", "こんにちは"]), [{ jp: "こんにちは", vi: null }]);
  });

  it("toàn Latin (romaji/EN) → mỗi dòng 1 cue, giữ nguyên", () => {
    assert.deepEqual(pairBilingualLines(["konnichiwa", "hello"]), [
      { jp: "konnichiwa", vi: null },
      { jp: "hello", vi: null },
    ]);
  });

  it("splitBilingualCueText tách body SRT", () => {
    assert.deepEqual(splitBilingualCueText("こんにちは\nXin chào"), { jp: "こんにちは", vi: "Xin chào" });
    assert.deepEqual(splitBilingualCueText("こんにちは"), { jp: "こんにちは", vi: null });
    assert.deepEqual(splitBilingualCueText("hello"), { jp: "hello", vi: null });
  });

  it("sampleWithTranslation ghép ngữ cảnh", () => {
    assert.equal(sampleWithTranslation("乙骨", "Okkotsu"), "乙骨\nVI: Okkotsu");
    assert.equal(sampleWithTranslation("乙骨", null), "乙骨");
    assert.equal(sampleWithTranslation("", "Okkotsu"), "Okkotsu");
  });

  it("splitTrailingVietnamese tách đuôi Việt dính liền", () => {
    assert.deepEqual(
      splitTrailingVietnamese("結果の出入りを可能にするルールを追加しなければならない nên phải thêm Luật cho phép vào Kết giới."),
      {
        jp: "結果の出入りを可能にするルールを追加しなければならない",
        vi: "nên phải thêm Luật cho phép vào Kết giới.",
      }
    );
  });

  it("đuôi romaji không dấu → không tách", () => {
    assert.deepEqual(splitTrailingVietnamese("ありがとう konnichiwa"), {
      jp: "ありがとう konnichiwa",
      vi: null,
    });
  });

  it("tiếng Nhật thuần → không tách", () => {
    assert.deepEqual(splitTrailingVietnamese("こんにちは"), { jp: "こんにちは", vi: null });
  });

  it("pairBilingualLines tách dòng dính JP+VI", () => {
    assert.deepEqual(pairBilingualLines(["ルールを追加しなければならない nên phải thêm Luật mới"]), [
      { jp: "ルールを追加しなければならない", vi: "nên phải thêm Luật mới" },
    ]);
  });
});
