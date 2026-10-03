import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMeaningVi, isEnglishParenContent, isEnglishWord, isStaleGuessedNameMeaning } from "../lib/meaningVi";

describe("meaningVi", () => {
  it("cắt đuôi EN: 'em bé (baby, infant)' → 'em bé'", () => {
    assert.equal(normalizeMeaningVi("em bé, trẻ sơ sinh (baby, infant)"), "em bé, trẻ sơ sinh");
  });

  it("giữ ngoặc Việt: 'Pekora (tên VTuber)'", () => {
    assert.equal(normalizeMeaningVi("Pekora (tên VTuber)", "Pekora"), "Pekora (tên VTuber)");
  });

  it("cắt nhiều đuôi lồng: 'a (b) (to eat)'", () => {
    assert.equal(normalizeMeaningVi("ăn (to eat) (verb)"), "ăn");
  });

  it("nghĩa thuần Việt giữ nguyên", () => {
    assert.equal(normalizeMeaningVi("đang ghen", "ジェラってる"), "đang ghen");
  });

  it("danh từ tiếng Anh: giữ từ + giải thích Việt sau", () => {
    assert.equal(
      normalizeMeaningVi("trang chia sẻ video", "YouTube"),
      "YouTube — trang chia sẻ video"
    );
  });

  it("danh từ Anh đã có từ ở đầu thì không prefix lặp", () => {
    assert.equal(
      normalizeMeaningVi("YouTube — trang chia sẻ video", "YouTube"),
      "YouTube — trang chia sẻ video"
    );
  });

  it("từ Nhật không prefix Anh", () => {
    assert.equal(normalizeMeaningVi("ăn", "食べる"), "ăn");
  });

  it("rỗng → rỗng", () => {
    assert.equal(normalizeMeaningVi(""), "");
    assert.equal(normalizeMeaningVi("   "), "");
  });

  it("isEnglishParenContent phân biệt Anh/Việt", () => {
    assert.equal(isEnglishParenContent("baby, infant"), true);
    assert.equal(isEnglishParenContent("tên VTuber"), false);
    assert.equal(isEnglishParenContent(""), false);
  });

  it("isEnglishWord nhận diện Latin", () => {
    assert.equal(isEnglishWord("YouTube"), true);
    assert.equal(isEnglishWord("Pekora"), true);
    assert.equal(isEnglishWord("テレビ"), false);
    assert.equal(isEnglishWord("ジェラってる"), false);
  });

  it("isStaleGuessedNameMeaning bắt nghĩa tên đoán mò", () => {
    assert.equal(isStaleGuessedNameMeaning("Yukkotsu, nhân vật trong truyện"), true);
    assert.equal(isStaleGuessedNameMeaning("Okkotsu, nhân vật trong truyện"), true);
    assert.equal(isStaleGuessedNameMeaning("Tên người: 乙骨"), false);
    assert.equal(isStaleGuessedNameMeaning("nhân vật chính"), false);
    assert.equal(isStaleGuessedNameMeaning("Okkotsu — nhân vật Jujutsu Kaisen"), false);
    assert.equal(isStaleGuessedNameMeaning(""), false);
  });
});
