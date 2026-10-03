import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSkippableToken,
  mergeMixedScriptTokens,
  normalizeAteji,
  isCommonKanaWord,
  getProperNounKind,
} from "../lib/vocabFilter";

const tok = (o: Record<string, string>) => ({
  surface_form: o.surface_form ?? "",
  pos: o.pos ?? "",
  basic_form: o.basic_form ?? "",
  reading: o.reading ?? "",
  pos_detail: o.pos_detail ?? "",
  pos_sub: o.pos_sub ?? "",
});

describe("ateji kana-words", () => {
  it("normalizeAteji: 成程 → basic なるほど + xóa tag tên riêng", () => {
    const out = normalizeAteji(
      tok({ surface_form: "成程", pos: "名詞", basic_form: "成程", reading: "ナルホド", pos_detail: "固有名詞", pos_sub: "地域" })
    );
    assert.equal(out.basic_form, "なるほど");
    assert.equal(out.surface_form, "成程");
    assert.equal(out.pos_detail, "");
    assert.equal(getProperNounKind(out), null);
  });

  it("merge 成|程 → 成程 basic なるほど, không còn là địa danh", () => {
    const out = mergeMixedScriptTokens([
      tok({ surface_form: "成", pos: "名詞", basic_form: "成", reading: "ナル", pos_detail: "固有名詞", pos_sub: "地域" }),
      tok({ surface_form: "程", pos: "助詞", basic_form: "程", reading: "ホド" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "成程");
    assert.equal(out[0].basic_form, "なるほど");
    assert.equal(getProperNounKind(out[0]), null);
  });

  it("hover được: 何故/なぜ (phó từ), 何処/どこ/誰 (đại từ)", () => {
    assert.equal(isSkippableToken(tok({ surface_form: "何故", pos: "副詞", basic_form: "何故", reading: "ナゼ" })), false);
    assert.equal(isSkippableToken(tok({ surface_form: "なぜ", pos: "副詞", basic_form: "なぜ", reading: "ナゼ" })), false);
    assert.equal(isSkippableToken(tok({ surface_form: "何処", pos: "名詞", basic_form: "何処", reading: "ドコ" })), false);
    assert.equal(isSkippableToken(tok({ surface_form: "どこ", pos: "名詞", basic_form: "どこ", reading: "ドコ" })), false);
    assert.equal(isSkippableToken(tok({ surface_form: "誰", pos: "名詞", basic_form: "誰", reading: "ダレ" })), false);
  });

  it("merge 何故 → basic なぜ", () => {
    const out = mergeMixedScriptTokens([tok({ surface_form: "何故", pos: "副詞", basic_form: "何故", reading: "ナゼ" })]);
    assert.equal(out[0].basic_form, "なぜ");
  });

  it("từ thường không bị ảnh hưởng", () => {
    assert.equal(isCommonKanaWord("テレビ", "テレビ"), false);
    assert.equal(isSkippableToken(tok({ surface_form: "は", pos: "助詞", basic_form: "は", reading: "ハ" })), true);
    const out = normalizeAteji(tok({ surface_form: "食べる", pos: "動詞", basic_form: "食べる", reading: "タベル" }));
    assert.equal(out.basic_form, "食べる");
  });
});
