"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { hasJapanese } from "@/lib/bilingual";
import { isNameOnlyLine } from "@/lib/properNames";
import { isPersonMeaning, loadPersonWordSet } from "@/lib/questionQuality";
import { QuestionType } from "@prisma/client";

// Chống spam generate (tốn Gemini quota): mỗi user tối thiểu cách nhau 30s/lần.
// In-memory single-instance — đủ cho đồ án; multi-instance thay bằng Redis.
const lastGenerateAt = new Map<string, number>();
const GENERATE_COOLDOWN_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GenerateOpts = {
  count?: number;
  overwrite?: boolean;
};

const LEVEL_ORDER = ["N5", "N4", "N3", "N2", "N1"] as const;
type LevelStr = (typeof LEVEL_ORDER)[number];

/** Level cho phép = video level ±1 (VD video N3 → N4,N3,N2). Chặn câu quá dễ/quá khó. */
function allowedLevelsFor(videoLevel: string): Set<string> {
  const idx = (LEVEL_ORDER as readonly string[]).indexOf(videoLevel);
  if (idx < 0) return new Set<string>(LEVEL_ORDER as unknown as string[]);
  const out = new Set<string>();
  for (let i = Math.max(0, idx - 1); i <= Math.min(LEVEL_ORDER.length - 1, idx + 1); i++) {
    out.add(LEVEL_ORDER[i] as string);
  }
  return out;
}

type vocabNormalized = {
  word: string;
  reading: string;
  meaning: string;
  freq: number;
  pos: string;
  level: string | null;
};

type Candidate = {
  question_type: QuestionType;
  content: string;
  options: string[];
  correct_answer: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j] as T;
    a[j] = tmp as T;
  }
  return a;
}

function clampCount(raw: unknown, fallback = 6): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  if (n < 1) return 1;
  if (n > 20) return 20;
  return n;
}

// ---------------------------------------------------------------------------
// Internal: load vocab via extractVocabFromVideo with fallback to DB
// ---------------------------------------------------------------------------

async function loadVocabList(videoId: number): Promise<vocabNormalized[]> {
  let rawList: unknown[] = [];
  let usedExtract = false;

  try {
    // Exception: dynamic import needed — peer slice file may not exist at build time
    // (Slice V lands concurrently). Static import would fail build if file missing;
    // fallback loads Vocabulary directly via prisma.
    const mod = (await import("./extractVocab")) as unknown as {
      extractVocabFromVideo?: (id: number) => Promise<unknown[]>;
    };
    if (typeof mod.extractVocabFromVideo === "function") {
      const res = await mod.extractVocabFromVideo(videoId);
      if (Array.isArray(res)) {
        rawList = res;
        usedExtract = true;
      }
    }
  } catch {
    // fallback to DB below
  }

  const normalized: vocabNormalized[] = [];

  if (usedExtract && rawList.length > 0) {
    for (const item of rawList) {
      const rec = item as Record<string, unknown>;
      // Bỏ tên riêng khỏi đề (đã tách loại ở extract — hỏi nghĩa tên người không có giá trị)
      const isProper = rec.isProper;
      if (typeof isProper === "string" && isProper) continue;
      const word = String(rec.word ?? rec.surface_form ?? "").trim();
      if (!word) continue;
      // Bỏ token rác 1 ký tự kana / ký hiệu (câu ngớ ngẩn hay sinh từ đây)
      if (word.length < 2 && !/[\u4e00-\u9fff]/.test(word)) continue;
      const readingRaw = rec.reading ?? rec.surface_form ?? word;
      const reading = String(readingRaw).trim() || word;
      // allow both basic_form and basic
      const basicForm = (rec.basic_form ?? rec.basic ?? word) as string;
      const pos = String(rec.pos ?? "unknown");
      const freq = Number(rec.freq ?? 1) || 1;
      const lvlRaw = String(rec.level ?? rec.jlpt ?? "").trim().toUpperCase();
      const level = (LEVEL_ORDER as readonly string[]).includes(lvlRaw) ? lvlRaw : null;
      let meaning = String(rec.meaning ?? "").trim();
      const vocabId = rec.vocabId as number | undefined;

      // enrich missing meaning via DB
      if (!meaning) {
        try {
          if (vocabId) {
            const db = await prisma.vocabulary.findUnique({ where: { id: vocabId } });
            if (db?.meaning) meaning = db.meaning;
          }
          if (!meaning) {
            const db2 = await prisma.vocabulary.findFirst({ where: { word } });
            if (db2?.meaning) meaning = db2.meaning;
            else if (db2 && !meaning) meaning = db2.meaning;
          }
        } catch {
          // ignore db errors
        }
      }
      if (!meaning) {
        // keep placeholder but mark — will be filtered if too generic?
        // we keep it to allow generation; test checks correct_answer khớp meaning
        // so we need real meaning, fallback to word itself if no DB
        meaning = word;
      }
      void basicForm;
      normalized.push({ word, reading, meaning, freq, pos, level });
    }
    // sort by freq desc as contract
    normalized.sort((a, b) => b.freq - a.freq);
  }

  // If extract gave nothing or too few, fallback to Vocabulary table
  if (normalized.length === 0) {
    try {
      const dbVocabs = await prisma.vocabulary.findMany({ take: 50, orderBy: { id: "asc" } });
      for (const v of dbVocabs) {
        normalized.push({
          word: v.word,
          reading: v.reading,
          meaning: v.meaning,
          freq: 1,
          pos: "名詞",
          level: (v as unknown as { level?: string }).level ?? null,
        });
      }
    } catch {
      // no db fallback
    }
  }

  // Supplement if <4 to ensure distractors can be built
  if (normalized.length > 0 && normalized.length < 4) {
    try {
      const extra = await prisma.vocabulary.findMany({ take: 30, orderBy: { id: "asc" } });
      const existingWords = new Set(normalized.map((x) => x.word));
      for (const v of extra) {
        if (normalized.length >= 12) break;
        if (existingWords.has(v.word)) continue;
        normalized.push({
          word: v.word,
          reading: v.reading,
          meaning: v.meaning,
          freq: 1,
          pos: "名詞",
          level: (v as unknown as { level?: string }).level ?? null,
        });
        existingWords.add(v.word);
      }
    } catch {
      // ignore
    }
  }

  return normalized;
}

async function tryLoadGrammar(videoId: number): Promise<void> {
  try {
    // Exception: dynamic import — Grammar slice may not yet be on disk during parallel landing;
    // static import would break build. Fallback queries Grammar tables directly.
    const mod = (await import("./extractGrammar")) as unknown as {
      extractGrammarFromVideo?: (id: number) => Promise<unknown>;
    };
    if (typeof mod.extractGrammarFromVideo === "function") {
      await mod.extractGrammarFromVideo(videoId);
    } else {
      // fallback direct DB load
      await prisma.grammar.findMany({ take: 20 });
      await prisma.videoGrammarTimeline.findMany({ where: { video_id: videoId } });
    }
  } catch {
    try {
      await prisma.grammar.findMany({ take: 20 });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Main: generateTestFromVideo
// ---------------------------------------------------------------------------

export async function generateTestFromVideo(
  videoId: number,
  opts?: GenerateOpts
): Promise<
  | { skipped: true; existingCount: number }
  | { created: number; questions: unknown[] }
  | { skipped?: false; created: number; questions: unknown[]; existingCount?: number }
> {
  "use server";

  const vid = Number(videoId);
  if (!Number.isInteger(vid) || vid <= 0) {
    throw new Error("videoId không hợp lệ");
  }
  // USER đăng nhập được generate khi chưa có đề (đề dùng chung cho mọi người);
  // chỉ ADMIN mới được ghi đè / xóa.
  const me = await getCurrentUser();
  if (!me) {
    throw new Error("Vui lòng đăng nhập để tạo đề");
  }
  const isAdmin = me.role === "ADMIN";

  // Chống spam nút Tạo (double-click / F5 liên tục)
  const now = Date.now();
  const last = lastGenerateAt.get(me.id) ?? 0;
  if (now - last < GENERATE_COOLDOWN_MS) {
    const wait = Math.ceil((GENERATE_COOLDOWN_MS - (now - last)) / 1000);
    throw new Error(`Tạo đề quá nhanh — thử lại sau ${wait}s`);
  }

  const count = clampCount(opts?.count, 10);
  // USER thường: bỏ qua cờ overwrite (không được xóa đề người khác đã tạo)
  const overwrite = Boolean(opts?.overwrite) && isAdmin;

  // Video level → band ±1 để lọc từ/nhiễu đúng trình độ
  const videoRow = await prisma.video.findUnique({ where: { id: vid }, select: { level: true } });
  const videoLevel = videoRow ? String(videoRow.level) : "N4";
  const allowed = allowedLevelsFor(videoLevel);

  // check existing
  let existingCount = 0;
  try {
    existingCount = await prisma.question.count({ where: { video_id: vid } });
  } catch (e) {
    // if DB not reachable, treat as 0 for generation path
    const msg = e instanceof Error ? e.message : String(e);
    // still throw to surface error? For test without DB, we cannot count
    // rethrow with context
    throw new Error(`Không thể kiểm tra questions hiện có: ${msg}`);
  }

  if (!overwrite && existingCount > 0) {
    return { skipped: true, existingCount };
  }

  // Ghi nhận mốc generate để chống spam (chỉ khi thực sự sinh đề mới)
  lastGenerateAt.set(me.id, now);

  if (overwrite && existingCount > 0) {
    await prisma.question.deleteMany({ where: { video_id: vid } });
  }

  // Load subtitles + vocab + grammar (as contract)
  const subtitles = await prisma.subtitle.findMany({
    where: { video_id: vid },
    orderBy: { start_time_ms: "asc" },
  });

  // still call grammar loader per contract
  await tryLoadGrammar(vid);

  const vocabList = await loadVocabList(vid);

  // Tập tên người (map cứng + DB) — loại câu hỏi tên người khỏi đề
  const personWords = await loadPersonWordSet();
  const isProperMeaning = (m: string): boolean =>
    (m ?? "").trim().startsWith("Tên ") || isPersonMeaning(m);

  // Prefetch extra meanings for distractor supplement — ƯU TIÊN cùng band ±1
  let extraMeaningsPool: string[] = [];
  try {
    const extraRows = await prisma.vocabulary.findMany({
      where: { level: { in: [...allowed] as unknown as never } },
      take: 100,
      orderBy: { id: "asc" },
    });
    // Tên riêng làm nhiễu rất lộ → loại khỏi pool
    extraMeaningsPool = extraRows.map((r) => r.meaning).filter((m) => m && !isProperMeaning(m));
    // Nếu band ±1 quá ít (<10) → nới ra toàn DB để vẫn đủ nhiễu thật (không dùng pad giả)
    if (extraMeaningsPool.length < 10) {
      const fallbackRows = await prisma.vocabulary.findMany({ take: 100, orderBy: { id: "asc" } });
      const seen = new Set(extraMeaningsPool);
      for (const r of fallbackRows) {
        if (r.meaning && !seen.has(r.meaning) && !isProperMeaning(r.meaning)) {
          extraMeaningsPool.push(r.meaning);
          seen.add(r.meaning);
        }
      }
    }
  } catch {
    extraMeaningsPool = vocabList.map((v) => v.meaning).filter((m) => m && !isProperMeaning(m));
  }

  // -----------------------------------------------------------------------
  // Build candidate pools
  // -----------------------------------------------------------------------

  const PLACEHOLDER_MEANING = "(chưa có trong từ điển)";

  const vocabCandidates: Candidate[] = [];
  // Lọc chất lượng: nghĩa thật (không placeholder, không trùng mặt chữ, dài ≥2),
  // từ dài ≥2 (trừ kanji đơn), ƯU TIÊN band ±1 của video
  const meaningfulPool = vocabList.filter(
    (v) =>
      v.meaning &&
      v.meaning !== PLACEHOLDER_MEANING &&
      v.meaning.trim().length >= 2 &&
      v.meaning !== v.word &&
      v.word.length >= 2
  );
  const inBand = meaningfulPool.filter((v) => !v.level || allowed.has(v.level));
  // Đủ hàng trong band (±1) thì chỉ lấy trong band; thiếu mới nới ra ngoài band
  const vocabSource =
    inBand.length >= 4 ? inBand : meaningfulPool.length >= 2 ? meaningfulPool : vocabList.filter((v) => v.meaning && v.meaning.trim() !== "");
  // Use top freq vocab — limit 20 to avoid explosion
  const topVocab = [...vocabSource].sort((a, b) => b.freq - a.freq).slice(0, 20);

  for (const v of topVocab) {
    const correct = v.meaning.trim();
    if (!correct || correct === PLACEHOLDER_MEANING || correct.length < 2) continue;
    // Bỏ câu hỏi tên người (hỏi nghĩa tên không có giá trị kiểm tra)
    if (personWords.has(v.word) || isNameOnlyLine(v.word, personWords) || isPersonMeaning(correct)) continue;

    // Nhiễu: ưu tiên cùng band ±1 trước, rồi mới tới nghĩa khác (tránh N5 lẫn vào đề N1)
    const sameBand = topVocab.filter(
      (o) =>
        o.meaning !== correct &&
        o.word !== v.word &&
        o.meaning !== PLACEHOLDER_MEANING &&
        o.meaning.trim().length >= 2 &&
        (!o.level || !v.level || o.level === v.level || (allowed.has(o.level) && allowed.has(v.level)))
    );
    const otherBand = topVocab.filter(
      (o) => o.meaning !== correct && o.word !== v.word && o.meaning !== PLACEHOLDER_MEANING && !sameBand.includes(o)
    );
    const orderedMeanings = [...new Set([...shuffle(sameBand), ...shuffle(otherBand)].map((o) => o.meaning))];

    let distractors = orderedMeanings.slice(0, 3);

    if (distractors.length < 3) {
      const used = new Set([correct, ...distractors]);
      const supplement = shuffle(
        [...new Set(extraMeaningsPool)].filter(
          (m) => m && m.trim().length >= 2 && !used.has(m) && m !== PLACEHOLDER_MEANING && m !== correct
        )
      ).slice(0, 3 - distractors.length);
      distractors = [...distractors, ...supplement];
    }

    // KHÔNG pad đáp án giả ("Xin chào/Tạm biệt...") — thiếu nhiễu thật thì BỎ câu này
    if (distractors.length < 3) continue;
    distractors = distractors.slice(0, 3);
    const options = shuffle([correct, ...distractors]);
    const reading = v.reading || v.word;
    const content = `「${v.word} (${reading})」の意味は？`;

    vocabCandidates.push({
      question_type: QuestionType.VOCAB_CHOICE,
      content,
      options,
      correct_answer: correct,
    });
  }

  // Fallback nếu band ±1 không đủ câu: lấy từ DB cùng band (không bịa đáp án)
  if (vocabCandidates.length < 2 && extraMeaningsPool.length >= 4) {
    const poolVocabs = await prisma.vocabulary.findMany({
      where: { level: { in: [...allowed] as unknown as never } },
      take: 20,
      orderBy: { id: "asc" },
    });
    const usable = poolVocabs.filter(
      (x) =>
        x.meaning &&
        x.meaning.trim().length >= 2 &&
        x.meaning !== x.word &&
        !personWords.has(x.word) &&
        !isPersonMeaning(x.meaning)
    );
    for (const v of usable.slice(0, 6)) {
      if (vocabCandidates.some((c) => c.content.includes(`「${v.word} `))) continue;
      const correct = v.meaning;
      const others = usable.filter((o) => o.meaning !== correct && o.meaning.trim().length >= 2).map((o) => o.meaning);
      const distractors = shuffle([...new Set(others)]).slice(0, 3);
      if (distractors.length < 3) continue; // bỏ thay vì pad giả
      const options = shuffle([correct, ...distractors]);
      vocabCandidates.push({
        question_type: QuestionType.VOCAB_CHOICE,
        content: `「${v.word} (${v.reading})」の意味は？`,
        options,
        correct_answer: correct,
      });
      if (vocabCandidates.length >= 6) break;
    }
  }

  // FILL_PARTICLE — chỉ câu thật đủ dài (≥8 ký tự, có trợ từ thật), KHÔNG bịa "___" ngẫu nhiên
  const PARTICLES = ["は", "が", "を", "に", "へ", "と", "で"] as const;
  const particleCandidates: Candidate[] = [];

  for (const s of subtitles) {
    const text = (s.raw_text ?? "").trim();
    if (text.length < 8) continue; // câu quá ngắn → đáp án đoán mò, bỏ
    if (!hasJapanese(text)) continue; // sub thuần Việt (dịch/title) → bỏ
    const present = (PARTICLES as readonly string[]).filter((p) => text.includes(p));
    if (present.length === 0) continue;
    const particle = shuffle([...present])[0] as string;
    // replace only first occurrence
    const content = text.replace(particle, "___") + " (điền trợ từ)";
    particleCandidates.push({
      question_type: QuestionType.FILL_PARTICLE,
      content,
      options: [...PARTICLES].slice(0, 4),
      correct_answer: particle,
    });
  }
  // KHÔNG tạo câu synthetic khi thiếu — thiếu thì để pool khác bù vào

  // LISTENING — nhiễu phải là 2 câu phụ đề THẬT khác (không chế "câu?", "câu!", "(1)")
  const listeningCandidates: Candidate[] = [];

  // Chỉ sub có chữ Nhật mới được làm câu nghe; sub thuần Việt và dòng chỉ là tên người bị loại
  const isHearable = (t: string): boolean =>
    t.length >= 5 && hasJapanese(t) && !isNameOnlyLine(t, personWords);

  for (const s of subtitles) {
    const raw = s.raw_text?.trim() ?? "";
    if (!isHearable(raw)) continue;
    const otherTexts = [
      ...new Set(
        subtitles
          .filter((o) => {
            const t = (o.raw_text ?? "").trim();
            return o.id !== s.id && t && t !== raw && isHearable(t);
          })
          .map((o) => (o.raw_text ?? "").trim())
      ),
    ];

    // Không đủ 2 câu thật khác → BỎ câu này (tránh đáp án ngớ ngẩn kiểu "câu?" / "câu!")
    if (otherTexts.length < 2) continue;
    const distractors = shuffle(otherTexts).slice(0, 2);
    const options = shuffle([raw, ...distractors]);
    const content = `Nghe và chọn câu đúng: "${raw}"`;

    listeningCandidates.push({
      question_type: QuestionType.LISTENING,
      content,
      options,
      correct_answer: raw,
    });
  }

  // KHÔNG bịa listening từ "こんにちは/さようなら" — thiếu phụ đề thật thì để 2 loại còn lại gánh

  // -----------------------------------------------------------------------
  // Balanced selection to ensure all 3 types present
  // -----------------------------------------------------------------------

  const pools: Array<{ type: QuestionType; items: Candidate[] }> = [
    { type: QuestionType.VOCAB_CHOICE, items: shuffle(vocabCandidates) },
    { type: QuestionType.FILL_PARTICLE, items: shuffle(particleCandidates) },
    { type: QuestionType.LISTENING, items: shuffle(listeningCandidates) },
  ];

  // Ensure each non-empty pool is shuffled already; round-robin picking
  const selected: Candidate[] = [];
  let round = 0;
  // First pass: round-robin to guarantee distribution
  while (selected.length < count) {
    let progressed = false;
    for (const pool of pools) {
      if (selected.length >= count) break;
      if (pool.items.length > 0) {
        const cand = pool.items.shift();
        if (cand) {
          selected.push(cand);
          progressed = true;
        }
      }
    }
    round++;
    if (!progressed) break;
    // safety: prevent infinite if all pools empty
    if (round > count * 3) break;
  }

  // If still need more, fill from remaining combined pool
  if (selected.length < count) {
    const remaining = shuffle(pools.flatMap((p) => p.items));
    for (const c of remaining) {
      if (selected.length >= count) break;
      selected.push(c);
    }
  }

  // If total pool smaller than count, adjust count
  const finalSelected = shuffle(selected).slice(0, count);

  if (finalSelected.length === 0) {
    // nothing to create — return empty
    return { created: 0, questions: [] };
  }

  // Persist
  const createData = finalSelected.map((c) => ({
    video_id: vid,
    question_type: c.question_type,
    content: c.content,
    options: c.options,
    correct_answer: c.correct_answer,
  }));

  await prisma.question.createMany({
    data: createData,
  });

  const questions = await prisma.question.findMany({
    where: { video_id: vid },
    orderBy: { id: "asc" },
  });

  // Return only newly created tail if we had previous delete? For overwrite=true we deleted, so all are new.
  // For fresh video, all are new. Return full set but also ensure created matches.
  // To be precise, return last `finalSelected.length` questions ordered desc
  const createdQuestions =
    questions.length > finalSelected.length
      ? questions.slice(-finalSelected.length)
      : questions;

  return { created: finalSelected.length, questions: createdQuestions };
}

export async function clearVideoQuestions(videoId: number): Promise<{ deleted: number }> {
  "use server";
  try {
    await requireAdmin();
  } catch {
    throw new Error("Forbidden — chỉ ADMIN mới xóa được đề");
  }
  const vid = Number(videoId);
  if (!Number.isInteger(vid) || vid <= 0) {
    throw new Error("videoId không hợp lệ");
  }
  const res = await prisma.question.deleteMany({ where: { video_id: vid } });
  return { deleted: res.count };
}
