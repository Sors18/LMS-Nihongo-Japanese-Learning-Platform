import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getProperNounKind,
  buildProperNounMeaning,
  mergeMixedScriptTokens,
} from "../lib/vocabFilter";
import { getKnownPersonNames, isNameOnlyLine } from "../lib/properNames";

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

  it("getKnownPersonNames chứa tên người, không lẫn chiêu thức", () => {
    const names = getKnownPersonNames();
    assert.ok(names.includes("五条悟"));
    assert.ok(names.includes("乙骨"));
    assert.ok(!names.includes("無量空処")); // chiêu thức kind proper → loại
    assert.ok(!names.includes("領域展開"));
  });

  it("isNameOnlyLine: tên trần / quote / kính ngữ → true; từ thường/câu dài → false", () => {
    assert.equal(isNameOnlyLine("五条"), true);
    assert.equal(isNameOnlyLine("「乙骨くん」"), true);
    assert.equal(isNameOnlyLine("ジョウゴ!"), true);
    assert.equal(isNameOnlyLine("TẬP 59: KẾT GIỚI SENDAI"), false); // không phải tên → để hasJapanese lo
    assert.equal(isNameOnlyLine("術式"), false); // từ thường 2 kanji → không đoán bừa
    assert.equal(isNameOnlyLine("石流の術式は呪力の放出"), false); // câu dài nhắc tên → giữ (tài liệu nghe hợp lệ)
    assert.equal(isNameOnlyLine(""), false);
    assert.equal(isNameOnlyLine("虎杖", new Set(["石流"])), true);
    assert.equal(isNameOnlyLine("石流", new Set(["石流"])), true); // tên học từ DB
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
