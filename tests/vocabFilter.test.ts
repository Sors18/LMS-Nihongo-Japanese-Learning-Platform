import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUsefulPos, isNumericSurface, isSkippableToken, mergeMixedScriptTokens } from "../lib/vocabFilter";

const tok = (o: Record<string, string>) => ({
  surface_form: o.surface_form ?? "",
  pos: o.pos ?? "",
  basic_form: o.basic_form ?? "",
  reading: o.reading ?? "",
});

describe("vocabFilter", () => {
  it("isUsefulPos: giữ danh/động/tính", () => {
    assert.equal(isUsefulPos("名詞"), true);
    assert.equal(isUsefulPos("動詞"), true);
    assert.equal(isUsefulPos("形容詞"), true);
  });

  it("isUsefulPos: chặn trợ từ/ký hiệu/cảm thán/phó từ", () => {
    assert.equal(isUsefulPos("助詞"), false);
    assert.equal(isUsefulPos("助動詞"), false);
    assert.equal(isUsefulPos("記号"), false);
    assert.equal(isUsefulPos("感動詞"), false);
    assert.equal(isUsefulPos("副詞"), false);
  });

  it("isNumericSurface", () => {
    assert.equal(isNumericSurface("123"), true);
    assert.equal(isNumericSurface("１２３"), true);
    assert.equal(isNumericSurface("abc"), false);
  });

  it("isSkippableToken: lọc noise kéo dài ぺぺぺ / おおお", () => {
    assert.equal(isSkippableToken(tok({ surface_form: "ぺぺぺ", pos: "感動詞" })), true);
    assert.equal(isSkippableToken(tok({ surface_form: "は", pos: "助詞" })), true);
  });

  it("isSkippableToken: giữ từ thật", () => {
    assert.equal(
      isSkippableToken(tok({ surface_form: "食べる", pos: "動詞", basic_form: "食べる", reading: "タベル" })),
      false
    );
  });

  it("isSkippableToken: lọc romaji/latin", () => {
    assert.equal(isSkippableToken(tok({ surface_form: "YouTube", pos: "名詞" })), true);
  });

  it("isSkippableToken: surface rỗng → skip", () => {
    assert.equal(isSkippableToken(tok({ surface_form: "  ", pos: "名詞" })), true);
  });
});

describe("mergeMixedScriptTokens", () => {
  const k = (surface_form: string, pos: string, extra: Record<string, string> = {}) =>
    tok({ surface_form, pos, basic_form: surface_form, reading: surface_form, ...extra });

  it("gộp ジェラ|って|る → ジェラってる (đang ghen, không phải gelatin)", () => {
    const out = mergeMixedScriptTokens([
      k("ジェラ", "名詞"),
      k("って", "助詞"),
      k("る", "動詞-自立"),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "ジェラってる");
    assert.equal(out[0].basic_form, "ジェラってる");
    assert.equal(out[0].pos, "動詞");
  });

  it("gộp ググ|る → ググる", () => {
    const out = mergeMixedScriptTokens([k("ググ", "名詞"), k("る", "動詞-自立")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "ググる");
  });

  it("gộp サボ|り → サボり", () => {
    const out = mergeMixedScriptTokens([k("サボ", "名詞"), k("り", "動詞-自立")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "サボり");
  });

  it("KHÔNG gộp テレビ|を|見る (trợ từ を thật)", () => {
    const out = mergeMixedScriptTokens([
      k("テレビ", "名詞"),
      k("を", "助詞-格助詞"),
      k("見る", "動詞-自立"),
    ]);
    assert.equal(out.length, 3);
    assert.equal(out[0].surface_form, "テレビ");
  });

  it("KHÔNG gộp スーパー|で|買う (で là trợ từ địa điểm)", () => {
    const out = mergeMixedScriptTokens([
      k("スーパー", "名詞"),
      k("で", "助詞-格助詞"),
      k("買う", "動詞-自立"),
    ]);
    assert.equal(out.length, 3);
  });

  it("KHÔNG gộp カラオケ|に|行く", () => {
    const out = mergeMixedScriptTokens([
      k("カラオケ", "名詞"),
      k("に", "助詞-格助詞"),
      k("行く", "動詞-自立"),
    ]);
    assert.equal(out.length, 3);
  });

  it("KHÔNG gộp stem 1 ký tự (ア|る)", () => {
    const out = mergeMixedScriptTokens([k("ア", "感動詞"), k("る", "動詞-自立")]);
    assert.equal(out.length, 2);
  });

  it("token lẻ không katakana giữ nguyên", () => {
    const out = mergeMixedScriptTokens([k("食べる", "動詞-自立") , k("パン", "名詞")]);
    assert.equal(out.length, 2);
  });
});

describe("mergeMixedScriptTokens — cụm động từ", () => {
  const v = (surface_form: string, pos: string, basic_form?: string) =>
    tok({ surface_form, pos, basic_form: basic_form ?? surface_form, reading: surface_form });

  it("gộp 聞き|飽き|た|ん → 聞き飽きたん (cả cụm)", () => {
    const out = mergeMixedScriptTokens([
      v("聞き", "動詞-自立", "聞く"),
      v("飽き", "動詞-自立", "飽きる"),
      v("た", "助動詞", "た"),
      v("ん", "助詞-終助詞", "ん"),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "聞き飽きたん");
    assert.equal(out[0].pos, "動詞");
  });

  it("TE-nối không gộp: 食べ|て|いる → 3 mảnh (lọc sau chỉ giữ 食べ→食べる)", () => {
    const out = mergeMixedScriptTokens([
      v("食べ", "動詞-自立", "食べる"),
      v("て", "助詞-接続助詞", "て"),
      v("いる", "動詞-非自立", "いる"),
    ]);
    assert.deepEqual(out.map((t) => t.surface_form), ["食べ", "て", "いる"]);
  });

  it("gộp 行き|ます → 行きます", () => {
    const out = mergeMixedScriptTokens([
      v("行き", "動詞-自立", "行く"),
      v("ます", "助動詞", "ます"),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "行きます");
  });

  it("TE-nối không gộp: 食べて|寝る → 食べて, 寝る riêng (stem về từ điển)", () => {
    const out = mergeMixedScriptTokens([
      v("食べて", "動詞-自立", "食べる"),
      v("寝る", "動詞-自立", "寝る"),
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].surface_form, "食べて");
    assert.equal(out[1].surface_form, "寝る");
  });

  it("DỪNG ở copula: …た|ん|だ → cụm + だ riêng", () => {
    const out = mergeMixedScriptTokens([
      v("飽き", "動詞-自立", "飽きる"),
      v("た", "助動詞", "た"),
      v("ん", "助詞-終助詞", "ん"),
      v("だ", "助動詞", "だ"),
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].surface_form, "飽きたん");
    assert.equal(out[1].surface_form, "だ");
  });

  it("KHÔNG gộp động từ nguyên thể đứng đầu: 食べる|ます → giữ nguyên", () => {
    const out = mergeMixedScriptTokens([
      v("食べる", "動詞-自立", "食べる"),
      v("ます", "助動詞", "ます"),
    ]);
    assert.equal(out.length, 2);
  });

  it("KHÔNG gộp qua danh từ: 書き|方 → giữ nguyên", () => {
    const out = mergeMixedScriptTokens([
      v("書き", "動詞-自立", "書く"),
      v("方", "名詞-一般", "方"),
    ]);
    assert.equal(out.length, 2);
  });

  it("TE-nối không gộp: 込め|て|行っ|て|み|よう → 込め, 行っ, みよう", () => {
    const out = mergeMixedScriptTokens([
      v("込め", "動詞-自立", "込める"),
      v("て", "助詞-接続助詞", "て"),
      v("行っ", "動詞-自立", "行く"),
      v("て", "助詞-接続助詞", "て"),
      v("み", "動詞-自立", "みる"),
      v("よう", "助動詞", "よう"),
    ]);
    assert.deepEqual(
      out.map((t) => t.surface_form),
      ["込め", "て", "行っ", "て", "みよう"]
    );
  });

  it("TE-nối không gộp: 食べ|て|いる → 食べ, て, いる (lọc sau loại て/いる)", () => {
    const out = mergeMixedScriptTokens([
      v("食べ", "動詞-自立", "食べる"),
      v("て", "助詞-接続助詞", "て"),
      v("いる", "動詞-自立", "いる"),
    ]);
    assert.deepEqual(out.map((t) => t.surface_form), ["食べ", "て", "いる"]);
    // pipeline lọc: chỉ còn stem (về từ điển qua basic_form)
    const kept = out.filter((t) => !isSkippableToken(tok({
      surface_form: t.surface_form, pos: "動詞-自立", basic_form: t.surface_form === "食べ" ? "食べる" : t.surface_form, reading: t.surface_form,
    })));
    assert.deepEqual(kept.map((t) => t.surface_form), ["食べ"]);
  });

  it("từ ghép stem+V vẫn gộp: 切り|替わる → 切り替わる", () => {
    const out = mergeMixedScriptTokens([
      v("切り", "動詞-自立", "切る"),
      v("替わる", "動詞-自立", "替わる"),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "切り替わる");
  });

  it("isSkippableToken loại mảnh TE lẻ + いる/ある bare", () => {
    const s = (surface: string, basic: string, pos = "動詞-自立") =>
      isSkippableToken(tok({ surface_form: surface, pos, basic_form: basic, reading: surface }));
    assert.equal(s("てる", "てる"), true);
    assert.equal(s("でいる", "でいる"), true);
    assert.equal(s("いる", "いる"), true);
    assert.equal(s("ある", "ある"), true);
    assert.equal(s("いた", "いる"), false);
    assert.equal(s("行く", "行く"), false);
    assert.equal(s("食べる", "食べる"), false);
  });
});

describe("mergeMixedScriptTokens — danh từ ghép Hán tự", () => {
  const h = (surface_form: string, pos = "名詞") =>
    tok({ surface_form, pos, basic_form: surface_form, reading: surface_form });

  it("gộp 耐|水|性 → 耐水性 (dịch cả cụm)", () => {
    const out = mergeMixedScriptTokens([h("耐"), h("水"), h("性")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "耐水性");
    assert.equal(out[0].pos, "名詞");
  });

  it("gộp 新|宿 → 新宿, 大阪|市 → 大阪市", () => {
    assert.equal(mergeMixedScriptTokens([h("新"), h("宿")])[0].surface_form, "新宿");
    assert.equal(mergeMixedScriptTokens([h("大阪"), h("市")])[0].surface_form, "大阪市");
  });

  it("KHÔNG dán 2 từ: 昨日|公園 → giữ nguyên", () => {
    const out = mergeMixedScriptTokens([h("昨日"), h("公園")]);
    assert.equal(out.length, 2);
  });

  it("KHÔNG gộp khi có trợ từ giữa: 東京|は → giữ nguyên", () => {
    const out = mergeMixedScriptTokens([h("東京"), tok({ surface_form: "は", pos: "助詞-係助詞", basic_form: "は", reading: "は" })]);
    assert.equal(out.length, 2);
  });
});

describe("mergeMixedScriptTokens — tiếp đầu/vĩ ngữ", () => {
  const p = (surface_form: string, pos: string, extra: Record<string, string> = {}) =>
    tok({ surface_form, pos, basic_form: surface_form, reading: surface_form, ...extra });

  it("gộp 未|熟 → 未熟 (không tra lẻ 熟 = chín muồi sai ngữ cảnh)", () => {
    const out = mergeMixedScriptTokens([p("未", "接頭詞"), p("熟", "名詞", { reading: "ジュク" })]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "未熟");
    assert.equal(out[0].pos, "名詞");
  });

  it("gộp 無|ジョウ → 無ジョウ", () => {
    const out = mergeMixedScriptTokens([p("無", "接頭詞"), p("ジョウ", "名詞")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "無ジョウ");
  });

  it("KHÔNG gộp tiếp đầu + trợ từ: 未|は → giữ nguyên", () => {
    const out = mergeMixedScriptTokens([p("未", "接頭詞"), p("は", "助詞-係助詞")]);
    assert.equal(out.length, 2);
  });

  it("gộp tiếp vĩ ngữ: 子供|達 → 子供達", () => {
    const out = mergeMixedScriptTokens([p("子供", "名詞"), p("達", "接尾詞")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "子供達");
  });

  it("KHÔNG gộp vĩ ngữ khi trước là ký hiệu", () => {
    const out = mergeMixedScriptTokens([p(" ", "記号"), p("達", "接尾詞")]);
    assert.equal(out.length, 2);
  });
  it("cả dòng thật: 未熟 無ジョウ されど → 3 từ nội dung", () => {
    const out = mergeMixedScriptTokens([
      p("未", "接頭詞", { reading: "ミ" }),
      p("熟", "名詞", { reading: "ジュク" }),
      p(" ", "記号"),
      p("無", "接頭詞", { reading: "ム" }),
      p("ジョウ", "名詞", { reading: "ジョウ" }),
      p(" ", "記号"),
      p("されど", "接続詞", { reading: "サレド" }),
    ]);
    const words = out.map((t) => t.surface_form).filter((s) => s.trim() !== "");
    assert.deepEqual(words, ["未熟", "無ジョウ", "されど"]);
  });
});

describe("mergeMixedScriptTokens — tính từ + さ/み", () => {
  const a = (surface_form: string, pos: string, extra: Record<string, string> = {}) =>
    tok({ surface_form, pos, basic_form: surface_form, reading: surface_form, ...extra });

  it("gộp 眩し|さ → 眩しさ (có pos_detail server)", () => {
    const out = mergeMixedScriptTokens([
      a("眩し", "形容詞", { reading: "マブシ", pos_detail: "自立" }),
      a("さ", "名詞", { reading: "サ", pos_detail: "接尾" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "眩しさ");
    assert.equal(out[0].pos, "名詞");
  });

  it("gộp 眩し|さ → 眩しさ (cache cũ mất detail, fallback reading サ)", () => {
    const out = mergeMixedScriptTokens([
      a("眩し", "形容詞", { reading: "マブシ" }),
      a("さ", "名詞", { reading: "サ" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "眩しさ");
  });

  it("gộp 大切|さ → 大切さ (な-adj)", () => {
    const out = mergeMixedScriptTokens([
      a("大切", "名詞", { reading: "タイセツ", pos_detail: "形容動詞語幹" }),
      a("さ", "名詞", { reading: "サ", pos_detail: "接尾" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "大切さ");
  });

  it("gộp 美し|み → 美しみ", () => {
    const out = mergeMixedScriptTokens([
      a("美し", "形容詞", { reading: "ウツクシ" }),
      a("み", "名詞", { reading: "ミ", pos_detail: "接尾" }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].surface_form, "美しみ");
  });
});
