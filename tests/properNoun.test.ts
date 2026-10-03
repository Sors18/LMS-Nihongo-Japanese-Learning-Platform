import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getProperNounKind,
  buildProperNounMeaning,
  mergeMixedScriptTokens,
} from "../lib/vocabFilter";

const tok = (o: Record<string, string>) => ({
  surface_form: o.surface_form ?? "",
  pos: o.pos ?? "",
  basic_form: o.basic_form ?? "",
  reading: o.reading ?? "",
  pos_detail: o.pos_detail ?? "",
  pos_sub: o.pos_sub ?? "",
});

describe("proper nouns", () => {
  it("nhận diện人名 → person", () => {
    assert.equal(
      getProperNounKind(tok({ surface_form: "田中", pos: "名詞", pos_detail: "固有名詞", pos_sub: "人名" })),
      "person"
    );
  });

  it("nhận diện地域 → place, 組織 → org", () => {
    assert.equal(
      getProperNounKind(tok({ surface_form: "東京", pos: "名詞", pos_detail: "固有名詞", pos_sub: "地域" })),
      "place"
    );
    assert.equal(
      getProperNounKind(tok({ surface_form: "任天堂", pos: "名詞", pos_detail: "固有名詞", pos_sub: "組織" })),
      "org"
    );
  });

  it("一般 → proper, thiếu detail → null", () => {
    assert.equal(
      getProperNounKind(tok({ surface_form: "ムーナ", pos: "名詞", pos_detail: "固有名詞", pos_sub: "一般" })),
      "proper"
    );
    assert.equal(getProperNounKind(tok({ surface_form: "猫", pos: "名詞" })), null);
    assert.equal(getProperNounKind(tok({ surface_form: "食べる", pos: "動詞", pos_detail: "固有名詞" })), null);
  });

  it("nghĩa cố định theo loại", () => {
    assert.equal(buildProperNounMeaning("田中", "person"), "Tên người: 田中");
    assert.equal(buildProperNounMeaning("東京", "place"), "Tên địa danh: 東京");
    assert.equal(buildProperNounMeaning("任天堂", "org"), "Tên tổ chức: 任天堂");
    assert.equal(buildProperNounMeaning("ムーナ", "proper"), "Tên riêng: ムーナ");
    assert.equal(buildProperNounMeaning("ムーナ", null), "ムーナ");
  });

  it("gộp giữ nguyên pos_detail (未熟 có detail vẫn nhận diện sau gộp)", () => {
    const out = mergeMixedScriptTokens([
      tok({ surface_form: "田", pos: "名詞", pos_detail: "固有名詞", pos_sub: "人名" }),
      tok({ surface_form: "中", pos: "名詞", pos_detail: "固有名詞", pos_sub: "人名" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "田中");
    assert.equal(getProperNounKind(out[0]), "person");
  });
});
