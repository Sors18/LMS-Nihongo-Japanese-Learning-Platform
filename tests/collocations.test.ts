import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lookupCollocation, mergeCollocations } from "../lib/collocations";

const tok = (surface_form: string, pos: string, extra: Record<string, string> = {}) => ({
  surface_form,
  pos,
  basic_form: extra.basic_form ?? surface_form,
  reading: extra.reading ?? surface_form,
  ...extra,
});

describe("lookupCollocation", () => {
  it("tra theo dạng chuẩn", () => {
    assert.equal(lookupCollocation("気になる")?.meaning, "quan tâm, để ý; tò mò muốn biết");
    assert.equal(lookupCollocation("気にする")?.reading, "きにする");
  });

  it("tra theo key noun|particle|verb", () => {
    assert.equal(lookupCollocation("気|に|なる")?.phrase, "気になる");
  });

  it("không có → null", () => {
    assert.equal(lookupCollocation("テレビを見る"), null);
    assert.equal(lookupCollocation(""), null);
  });
});

describe("mergeCollocations", () => {
  it("gộp 気|に|なる → 気になる", () => {
    const out = mergeCollocations([
      tok("気", "名詞", { basic_form: "気", reading: "キ" }),
      tok("に", "助詞-格助詞", { basic_form: "に", reading: "ニ" }),
      tok("なる", "動詞-自立", { basic_form: "なる", reading: "ナル" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "気になる");
    assert.equal(out[0].basic_form, "気になる");
    assert.equal(out[0].pos, "動詞");
  });

  it("thể chia なった vẫn gộp (so basic_form)", () => {
    const out = mergeCollocations([
      tok("気", "名詞", { basic_form: "気", reading: "キ" }),
      tok("に", "助詞-格助詞", { basic_form: "に", reading: "ニ" }),
      tok("なった", "動詞-自立", { basic_form: "なる", reading: "ナッタ" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "気になった");
    assert.equal(out[0].basic_form, "気になる");
  });

  it("đuôi trợ động từ lẻ (なっ|た) gộp theo", () => {
    const out = mergeCollocations([
      tok("気", "名詞", { basic_form: "気", reading: "キ" }),
      tok("に", "助詞-格助詞", { basic_form: "に", reading: "ニ" }),
      tok("なっ", "動詞-自立", { basic_form: "なる", reading: "ナッ" }),
      tok("た", "助動詞", { basic_form: "た", reading: "タ" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "気になった");
    assert.equal(out[0].basic_form, "気になる");
  });

  it("KHÔNG gộp cụm thường: テレビ|を|見る", () => {
    const out = mergeCollocations([
      tok("テレビ", "名詞", { basic_form: "テレビ" }),
      tok("を", "助詞-格助詞", { basic_form: "を" }),
      tok("見る", "動詞-自立", { basic_form: "見る" }),
    ]);
    assert.equal(out.length, 3);
  });

  it("KHÔNG gộp khi thiếu động từ", () => {
    const out = mergeCollocations([
      tok("気", "名詞", { basic_form: "気" }),
      tok("に", "助詞-格助詞", { basic_form: "に" }),
    ]);
    assert.equal(out.length, 2);
  });

  it("giữ token xung quanh nguyên vẹn", () => {
    const out = mergeCollocations([
      tok("私", "名詞", { basic_form: "私" }),
      tok("は", "助詞-係助詞", { basic_form: "は" }),
      tok("夢", "名詞", { basic_form: "夢", reading: "ユメ" }),
      tok("を", "助詞-格助詞", { basic_form: "を", reading: "ヲ" }),
      tok("見た", "動詞-自立", { basic_form: "見る", reading: "ミタ" }),
    ]);
    assert.deepEqual(out.map((t) => t.surface_form), ["私", "は", "夢を見た"]);
    assert.equal(out[2].basic_form, "夢を見る");
  });

  it("biến thể kana: ゆめ|を|みた → 夢を見る", () => {
    const out = mergeCollocations([
      tok("ゆめ", "名詞", { basic_form: "ゆめ", reading: "ユメ" }),
      tok("を", "助詞-格助詞", { basic_form: "を", reading: "ヲ" }),
      tok("みた", "動詞-自立", { basic_form: "みる", reading: "ミタ" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].basic_form, "夢を見る");
  });

  it("động từ bị gộp cụm trước (なっ|た → なった, basic mất) vẫn gộp", () => {
    const out = mergeCollocations([
      tok("気", "名詞", { basic_form: "気", reading: "キ" }),
      tok("に", "助詞-格助詞", { basic_form: "に", reading: "ニ" }),
      // giả lập verb-cluster đã gộp: basic_form = surface
      tok("なった", "動詞", { basic_form: "なった", reading: "ナッタ" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "気になった");
    assert.equal(out[0].basic_form, "気になる");
  });
});
