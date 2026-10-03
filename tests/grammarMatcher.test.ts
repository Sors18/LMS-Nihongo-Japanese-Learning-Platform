import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeRegExp,
  buildGrammarRegex,
  matchesGrammar,
  filterMatchingStructures,
} from "../lib/grammarMatcher";

describe("grammarMatcher", () => {
  it("escapeRegExp thoát ký tự đặc biệt", () => {
    assert.equal(escapeRegExp("a.b(c)"), "a\\.b\\(c\\)");
  });

  it("buildGrammarRegex: 〜 → .*", () => {
    const re = buildGrammarRegex("〜は〜です");
    assert.match("私は田中です", re);
    assert.doesNotMatch("こんにちは", re);
  });

  it("buildGrammarRegex: structure rỗng → never-match", () => {
    const re = buildGrammarRegex("〜");
    assert.equal(re.test("何でも"), false);
  });

  it("matchesGrammar: includes stripped", () => {
    assert.equal(matchesGrammar("私は田中です", "〜は〜です"), true);
  });

  it("matchesGrammar: nới lỏng 〜たいです match 食べたい", () => {
    assert.equal(matchesGrammar("食べたい", "〜たいです"), true);
  });

  it("matchesGrammar: không match sai", () => {
    assert.equal(matchesGrammar("こんにちは", "〜たいです"), false);
  });

  it("matchesGrammar: input rỗng → false", () => {
    assert.equal(matchesGrammar("", "〜たい"), false);
    assert.equal(matchesGrammar("食べたい", ""), false);
  });

  it("filterMatchingStructures lọc đúng", () => {
    const out = filterMatchingStructures("食べたい", ["〜たいです", "〜は〜です"]);
    assert.ok(out.includes("〜たいです"));
    assert.ok(!out.includes("〜は〜です"));
  });

  it("matchesGrammar: 〜てる vs 食べている — matcher literal hiện tại KHÔNG match (giới hạn M9, Gemini lo ngữ cảnh)", () => {
    assert.equal(matchesGrammar("食べている", "〜てる"), false);
    assert.equal(matchesGrammar("食べてる", "〜てる"), true);
  });

  it("matchesGrammar: type sai → false, không throw", () => {
    assert.equal(matchesGrammar(null as never, "〜たい"), false);
  });
});
