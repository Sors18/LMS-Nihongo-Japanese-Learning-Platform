import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVocabCacheKey, bustVocabCache } from "../lib/vocabLookup";

describe("vocabLookup cache key", () => {
  it("key cơ bản theo word", () => {
    assert.match(buildVocabCacheKey("ジェラってる"), /^v\d+:vocab:word:ジェラってる$/);
  });

  it("có reading thì key khác", () => {
    assert.match(buildVocabCacheKey("食べる", "たべる"), /^v\d+:vocab:wr:食べる:たべる$/);
    assert.notEqual(buildVocabCacheKey("食べる"), buildVocabCacheKey("食べる", "たべる"));
  });

  it("có sample thì key khác (nghĩa theo ngữ cảnh)", () => {
    const a = buildVocabCacheKey("ジェラってる", undefined, "ジェラってるよ");
    const b = buildVocabCacheKey("ジェラってる");
    assert.notEqual(a, b);
    assert.equal(buildVocabCacheKey("ジェラってる", undefined, "ジェラってるよ"), a);
  });

  it("bustVocabCache đổi epoch → key cũ hết hiệu lực", () => {
    const before = buildVocabCacheKey("食べる");
    bustVocabCache();
    assert.notEqual(buildVocabCacheKey("食べる"), before);
  });
});
