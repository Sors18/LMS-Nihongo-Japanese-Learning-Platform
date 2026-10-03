/**
 * Cụm cố định danh từ + phó từ + động từ tạo nghĩa riêng
 * (気になる ≠ 気 + なる, 気にする ≠ 気 + する…).
 * Kuromoji chẻ lẻ từng mảnh (に là trợ từ bị lọc) → tra lẻ sai nghĩa,
 * nên gộp cả cụm trước khi tra và lấy nghĩa từ điển có sẵn (khỏi tốn AI).
 * Client-safe (không import server-only).
 */

export type CollocationEntry = {
  /** Dạng chuẩn: nounBasic + particle + verbBasic, VD 気になる */
  phrase: string;
  reading: string;
  meaning: string;
  level: string;
};

type RawEntry = [
  noun: string, nounKana: string, particle: string,
  verb: string, verbKana: string, reading: string, meaning: string, level: string,
];

// [danh từ, danh từ kana, phó từ, động từ thể từ điển, động từ kana, reading, nghĩa Việt, level]
const RAW: RawEntry[] = [
  ["気", "き", "に", "なる", "なる", "きになる", "quan tâm, để ý; tò mò muốn biết", "N4"],
  ["気", "き", "に", "する", "する", "きにする", "để tâm, bận lòng về", "N4"],
  ["気", "き", "が", "する", "する", "きがする", "cảm thấy, có cảm giác là", "N4"],
  ["気", "き", "に", "入る", "いる", "きにいる", "thích, ưng ý", "N3"],
  ["気", "き", "を", "付ける", "つける", "きをつける", "cẩn thận, chú ý", "N4"],
  ["気", "き", "が", "付く", "つく", "きがつく", "nhận ra, để ý thấy", "N4"],
  ["気", "き", "が", "合う", "あう", "きがあう", "hợp nhau, tâm đầu ý hợp", "N3"],
  ["目", "め", "に", "する", "する", "めにする", "trông thấy, chứng kiến", "N3"],
  ["目", "め", "を", "疑う", "うたがう", "めをうたがう", "không tin vào mắt mình", "N2"],
  ["耳", "みみ", "に", "する", "する", "みみにする", "nghe được, nghe thấy", "N3"],
  ["耳", "みみ", "を", "疑う", "うたがう", "みみをうたがう", "không tin vào tai mình", "N2"],
  ["口", "くち", "に", "する", "する", "くちにする", "ăn, nếm; nhắc đến", "N3"],
  ["手", "て", "に", "する", "する", "てにする", "giành được, có được", "N2"],
  ["手", "て", "に", "入れる", "いれる", "てにいれる", "có được, giành được", "N3"],
  ["手", "て", "を", "抜く", "ぬく", "てをぬく", "làm qua loa, ăn bớt công đoạn", "N3"],
  ["力", "ちから", "を", "入れる", "いれる", "ちからをいれる", "dồn sức, nỗ lực", "N3"],
  ["声", "こえ", "を", "かける", "かける", "こえをかける", "bắt chuyện, gọi với theo", "N4"],
  ["顔", "かお", "を", "出す", "だす", "かおをだす", "ghé qua, ló mặt tới", "N3"],
  ["頭", "あたま", "に", "来る", "くる", "あたまにくる", "tức điên lên", "N3"],
  ["腹", "はら", "が", "立つ", "たつ", "はらがたつ", "tức giận, nổi cáu", "N3"],
  ["馬", "うま", "が", "合う", "あう", "うまがあう", "hợp cạ với nhau", "N2"],
  ["年", "とし", "を", "取る", "とる", "としをとる", "già đi, có tuổi", "N4"],
  ["席", "せき", "を", "外す", "はずす", "せきをはずす", "ra ngoài một lát", "N3"],
  ["夢", "ゆめ", "を", "見る", "みる", "ゆめをみる", "nằm mơ", "N4"],
  ["風邪", "かぜ", "を", "引く", "ひく", "かぜをひく", "bị cảm", "N5"],
  ["熱", "ねつ", "を", "出す", "だす", "ねつをだす", "bị sốt", "N4"],
  ["息", "いき", "を", "付く", "つく", "いきをつく", "thở dài; nghỉ ngơi một lát", "N3"],
  ["涙", "なみだ", "を", "流す", "ながす", "なみだをながす", "rơi lệ, khóc", "N3"],
  ["汗", "あせ", "を", "掻く", "かく", "あせをかく", "đổ mồ hôi", "N4"],
  ["恥", "はじ", "を", "掻く", "かく", "はじをかく", "bẽ mặt, mất mặt", "N3"],
  ["損", "そん", "を", "する", "する", "そんをする", "bị thiệt", "N3"],
  ["得", "とく", "を", "する", "する", "とくをする", "được lợi", "N3"],
  ["怪我", "けが", "を", "する", "する", "けがをする", "bị thương", "N4"],
  ["邪魔", "じゃま", "を", "する", "する", "じゃまをする", "làm phiền, cản trở", "N4"],
  ["お世話", "おせわ", "に", "なる", "なる", "おせわになる", "được giúp đỡ (lời cảm ơn)", "N4"],
  ["世話", "せわ", "に", "なる", "なる", "せわになる", "được ai giúp đỡ", "N4"],
  ["電話", "でんわ", "に", "出る", "でる", "でんわにでる", "nghe điện thoại", "N4"],
  ["相手", "あいて", "に", "する", "する", "あいてにする", "tiếp chuyện, để ý tới", "N3"],
  ["役", "やく", "に", "立つ", "たつ", "やくにたつ", "hữu ích, có ích", "N4"],
];

const byKey = new Map<string, CollocationEntry>();
for (const [noun, nounKana, particle, verb, verbKana, reading, meaning, level] of RAW) {
  const phrase = noun + particle + verb;
  const entry: CollocationEntry = { phrase, reading, meaning, level };
  // Đăng ký cả biến thể kanji/kana (phụ đề anime hay viết kana: ゆめをみる)
  const nouns = new Set([noun, nounKana]);
  const verbs = new Set([verb, verbKana]);
  for (const n of nouns) for (const v of verbs) {
    const key = `${n}|${particle}|${v}`;
    if (!byKey.has(key)) byKey.set(key, entry);
  }
}

/** Tra cụm theo dạng chuẩn (VD "気になる") hoặc key (noun|particle|verb). */
export function lookupCollocation(phraseOrKey: string): CollocationEntry | null {
  const t = (phraseOrKey ?? "").trim();
  if (!t) return null;
  if (t.includes("|")) return byKey.get(t) ?? null;
  for (const e of byKey.values()) {
    if (e.phrase === t) return e;
  }
  return null;
}

export type CollocationToken = {
  surface_form: string;
  basic_form?: string;
  reading?: string;
  pos?: string;
};

function basePos(pos: string): string {
  return (pos ?? "").split("-")[0]?.trim() ?? "";
}

function basicOf(t: CollocationToken): string {
  return ((t.basic_form ?? "").trim() || (t.surface_form ?? "").trim());
}

// Đuôi trợ động từ (dài trước) — lột khỏi surface động từ đã bị gộp cụm (なった → なっ)
const AUX_END_RE = /(ました|ませんでした|ません|なかった|たかった|ている|でいる|させる|せる|られる|れる|ます|です|たがる|ない|たい|よう|まい|なさい|た|だ|て|で|う|おう|よう|ろ|よ|な|ね|さ|し)$/u;

// Stem → động từ thể từ điển (kanji + kana) — đoán lại basic khi token đã bị gộp cụm
const VERB_STEM_MAP: Record<string, string[]> = {
  なっ: ["なる"], なろ: ["なる"], なり: ["なる"], なれ: ["なる"], な: ["なる"],
  し: ["する"], さ: ["する"], す: ["する"], せ: ["する"], しよ: ["する"], すれ: ["する"],
  入っ: ["入る"], 入り: ["入る"], 入ろ: ["入る"], 入れ: ["入る", "入れる"],
  はいっ: ["入る"], はいり: ["入る"], いれ: ["入れる"],
  い: ["いる", "入る"], つけ: ["付ける", "つける"], 付け: ["付ける"],
  つき: ["付く", "つく"], つか: ["付く", "つく"], つこ: ["付く", "つく"],
  付き: ["付く"], 付か: ["付く"], 付こ: ["付く"],
  合っ: ["合う"], 合わ: ["合う"], 合い: ["合う"], 合え: ["合う"], 合お: ["合う"],
  あっ: ["合う", "あう"], あわ: ["合う", "あう"],
  疑っ: ["疑う"], 疑わ: ["疑う"], 疑い: ["疑う"], 疑え: ["疑う"],
  うたがっ: ["疑う", "うたがう"], うたがわ: ["疑う", "うたがう"],
  抜か: ["抜く"], 抜き: ["抜く"], 抜け: ["抜く"], 抜こ: ["抜く"],
  ぬか: ["抜く", "ぬく"], ぬき: ["抜く", "ぬく"],
  かけ: ["かける"], 出し: ["出す"], 出さ: ["出す"], 出そ: ["出す"],
  だし: ["出す", "だす"], ださ: ["出す", "だす"],
  来: ["来る"], き: ["来る", "くる"], こ: ["来る", "くる"], くれ: ["来る", "くる"], こよ: ["来る", "くる"],
  立た: ["立つ"], 立ち: ["立つ"], 立て: ["立つ"], 立と: ["立つ"],
  たた: ["立つ", "たつ"], たち: ["立つ", "たつ"],
  取ら: ["取る"], 取り: ["取る"], 取れ: ["取る"], 取ろ: ["取る"],
  とら: ["取る", "とる"], とり: ["取る", "とる"],
  外さ: ["外す"], 外し: ["外す"], 外せ: ["外す"],
  はずさ: ["外す", "はずす"], はずし: ["外す", "はずす"],
  見: ["見る"], み: ["見る", "みる"],
  引か: ["引く"], 引き: ["引く"], 引け: ["引く"], 引こ: ["引く"],
  ひか: ["引く", "ひく"], ひき: ["引く", "ひく"],
  流さ: ["流す"], 流し: ["流す"], 流せ: ["流す"],
  ながさ: ["流す", "ながす"], ながし: ["流す", "ながす"],
  掻か: ["掻く"], 掻き: ["掻く"], 掻け: ["掻く"],
  かか: ["掻く", "かく"], かき: ["掻く", "かく"],
  出: ["出る"], で: ["出る", "でる"],
};

/** Đoán basic động từ từ surface đã chia (なった → なる) khi basic gốc đã mất. */
function guessVerbBasics(surface: string): string[] {
  let stem = (surface ?? "").trim();
  for (let k = 0; k < 3; k++) {
    const next = stem.replace(AUX_END_RE, "");
    if (next === stem || next.length < 1) break;
    stem = next;
  }
  const cands = VERB_STEM_MAP[stem];
  return cands ? [...new Set(cands)] : [];
}

/**
 * Gộp cụm danh từ + phó từ + động từ (気|に|なる → 気になる).
 * Chạy SAU mergeMixedScriptTokens. Động từ chia (なった, なっている) vẫn gộp
 * nhờ so basic_form; đuôi trợ động từ (た, ている…) gộp theo vào surface.
 * Token gộp: pos 動詞, basic_form dạng chuẩn để tra nghĩa cả cụm.
 */
export function mergeCollocations<T extends CollocationToken>(tokens: T[]): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < tokens.length) {
    const merged = tryMergeAt(tokens, i);
    if (merged) {
      out.push(merged.token);
      i = merged.next;
      continue;
    }
    out.push(tokens[i]);
    i++;
  }
  return out;
}

function tryMergeAt<T extends CollocationToken>(tokens: T[], i: number): { token: T; next: number } | null {
  const t0 = tokens[i];
  const t1 = tokens[i + 1];
  const t2 = tokens[i + 2];
  if (!t0 || !t1 || !t2) return null;
  // Danh từ + phó từ + động từ
  if (!basePos(t0.pos ?? "").startsWith("名詞")) return null;
  if (basePos(t1.pos ?? "") !== "助詞") return null;
  if (!basePos(t2.pos ?? "").startsWith("動詞")) return null;
  const p1 = (t1.surface_form ?? "").trim();
  if (p1.length !== 1 || !"にがをと".includes(p1)) return null;
  const key = `${basicOf(t0)}|${p1}|${basicOf(t2)}`;
  let entry = byKey.get(key);
  if (!entry && basicOf(t2) === (t2.surface_form ?? "").trim()) {
    // Động từ đã bị gộp cụm trước đó (なっ|た → なった, basic gốc mất) → đoán lại từ stem
    for (const cand of guessVerbBasics((t2.surface_form ?? "").trim())) {
      const e = byKey.get(`${basicOf(t0)}|${p1}|${cand}`);
      if (e) {
        entry = e;
        break;
      }
    }
  }
  if (!entry) return null;
  // Nuốt đuôi trợ động từ sau động từ (た, ている, ます…): なった, なっている
  const tail: T[] = [];
  let j = i + 3;
  while (j < tokens.length && tail.length < 3) {
    const p = tokens[j];
    const b = basePos(p.pos ?? "");
    const isAux = b === "助動詞" || ((p.pos ?? "").includes("非自立") && b === "動詞");
    if (!isAux) break;
    tail.push(p);
    j++;
  }
  const parts = [t0, t1, t2, ...tail];
  const mergedSurface = parts.map((p) => (p.surface_form ?? "").trim()).join("");
  const reading =
    parts
      .map((p) => (p.reading ?? "").trim())
      .filter((r) => r && r !== "*")
      .join("") || entry.reading;
  return {
    token: {
      ...t2,
      surface_form: mergedSurface,
      basic_form: entry.phrase,
      reading,
      pos: "動詞",
    },
    next: j,
  };
}
