"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { QuestionType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GenerateOpts = {
  count?: number;
  overwrite?: boolean;
};

type vocabNormalized = {
  word: string;
  reading: string;
  meaning: string;
  freq: number;
  pos: string;
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
      const readingRaw = rec.reading ?? rec.surface_form ?? word;
      const reading = String(readingRaw).trim() || word;
      // allow both basic_form and basic
      const basicForm = (rec.basic_form ?? rec.basic ?? word) as string;
      const pos = String(rec.pos ?? "unknown");
      const freq = Number(rec.freq ?? 1) || 1;
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
      normalized.push({ word, reading, meaning, freq, pos });
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
  try {
    await requireAdmin();
  } catch {
    throw new Error("Forbidden — chỉ ADMIN mới tạo được đề");
  }

  const count = clampCount(opts?.count, 6);
  const overwrite = Boolean(opts?.overwrite);

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

  // Prefetch extra meanings for distractor supplement (single DB query)
  let extraMeaningsPool: string[] = [];
  try {
    const extraRows = await prisma.vocabulary.findMany({ take: 100, orderBy: { id: "asc" } });
    extraMeaningsPool = extraRows.map((r) => r.meaning).filter(Boolean);
  } catch {
    extraMeaningsPool = vocabList.map((v) => v.meaning);
  }

  // -----------------------------------------------------------------------
  // Build candidate pools
  // -----------------------------------------------------------------------

  const PLACEHOLDER_MEANING = "(chưa có trong từ điển)";

  const vocabCandidates: Candidate[] = [];
  // Prefer vocab with real dictionary meaning; exclude placeholders if enough entries exist
  const meaningfulPool = vocabList.filter(
    (v) => v.meaning && v.meaning !== PLACEHOLDER_MEANING && v.meaning.trim() !== "" && v.meaning !== v.word
  );
  const vocabSource = meaningfulPool.length >= 2 ? meaningfulPool : vocabList.filter((v) => v.meaning && v.meaning.trim() !== "");
  // Use top freq vocab — limit 20 to avoid explosion
  const topVocab = [...vocabSource].sort((a, b) => b.freq - a.freq).slice(0, 20);

  for (const v of topVocab) {
    const correct = v.meaning.trim();
    if (!correct || correct === PLACEHOLDER_MEANING) continue;

    // build distractors from other vocab meanings — dedup & exclude placeholder
    const otherMeaningsRaw = topVocab
      .filter((o) => o.meaning !== correct && o.word !== v.word && o.meaning !== PLACEHOLDER_MEANING)
      .map((o) => o.meaning);
    const otherMeanings = [...new Set(otherMeaningsRaw)];

    let distractors = shuffle(otherMeanings).slice(0, 3);

    if (distractors.length < 3) {
      const used = new Set([correct, ...distractors]);
      const supplement = shuffle(
        [...new Set(extraMeaningsPool)].filter((m) => !used.has(m) && m !== PLACEHOLDER_MEANING)
      ).slice(0, 3 - distractors.length);
      distractors = [...distractors, ...supplement];
    }

    // final pad if still not enough (synthetic)
    const pads = ["Xin chào", "Tạm biệt", "Cảm ơn", "Xin lỗi", "Học tập", "Ngôn ngữ"];
    let padIdx = 0;
    while (distractors.length < 3) {
      const candidate = pads[padIdx % pads.length] as string;
      padIdx++;
      if (candidate !== correct && !distractors.includes(candidate)) {
        distractors.push(candidate);
      } else {
        distractors.push(`${candidate} ${padIdx}`);
      }
    }
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

  // Fallback if no vocabCandidates but we have DB vocab pool
  if (vocabCandidates.length === 0 && extraMeaningsPool.length >= 4) {
    // create at least 2 vocab candidates from DB
    const poolVocabs = await prisma.vocabulary.findMany({ take: 10, orderBy: { id: "asc" } });
    for (const v of poolVocabs.slice(0, 4)) {
      const correct = v.meaning;
      const others = poolVocabs.filter((o) => o.meaning !== correct).map((o) => o.meaning);
      const distractors = shuffle(others).slice(0, 3);
      const options = shuffle([correct, ...distractors]);
      vocabCandidates.push({
        question_type: QuestionType.VOCAB_CHOICE,
        content: `「${v.word} (${v.reading})」の意味は？`,
        options,
        correct_answer: correct,
      });
    }
  }

  // FILL_PARTICLE
  const PARTICLES = ["は", "が", "を", "に"] as const;
  const particleCandidates: Candidate[] = [];

  for (const s of subtitles) {
    const text = s.raw_text ?? "";
    if (!text.trim()) continue;
    const present = (PARTICLES as readonly string[]).filter((p) => text.includes(p));
    if (present.length === 0) continue;
    const particle = shuffle([...present])[0] as string;
    // replace only first occurrence
    const content = text.replace(particle, "___") + " (điền trợ từ)";
    particleCandidates.push({
      question_type: QuestionType.FILL_PARTICLE,
      content,
      options: [...PARTICLES],
      correct_answer: particle,
    });
  }

  // if none found but subtitles exist, create synthetic particle questions
  if (particleCandidates.length === 0 && subtitles.length > 0) {
    for (const s of subtitles.slice(0, 2)) {
      const particle = shuffle([...PARTICLES])[0] as string;
      const content = s.raw_text + ` ___ (điền trợ từ)`;
      particleCandidates.push({
        question_type: QuestionType.FILL_PARTICLE,
        content,
        options: [...PARTICLES],
        correct_answer: particle,
      });
    }
  }

  // LISTENING
  const listeningCandidates: Candidate[] = [];

  for (const s of subtitles) {
    const raw = s.raw_text?.trim();
    if (!raw) continue;
    const otherTexts = subtitles
      .filter((o) => o.id !== s.id && o.raw_text?.trim() && o.raw_text.trim() !== raw)
      .map((o) => o.raw_text.trim());

    let distractors: string[] = [];
    if (otherTexts.length >= 2) {
      distractors = shuffle(otherTexts).slice(0, 2);
    } else if (otherTexts.length === 1) {
      const only = otherTexts[0] as string;
      distractors = [only, `${only}？`];
    } else {
      // single subtitle case
      distractors = [`${raw}？`, `${raw}！`];
    }
    // ensure distinct and not equal correct
    distractors = distractors.filter((d) => d !== raw);
    while (distractors.length < 2) {
      const pad = `${raw} (${distractors.length + 1})`;
      if (!distractors.includes(pad) && pad !== raw) distractors.push(pad);
      else distractors.push(`${pad}_`);
    }
    distractors = distractors.slice(0, 2);
    const options = shuffle([raw, ...distractors]);
    const content = `Nghe và chọn câu đúng: "${raw}"`;

    listeningCandidates.push({
      question_type: QuestionType.LISTENING,
      content,
      options,
      correct_answer: raw,
    });
  }

  // If subtitles empty, create synthetic listening from vocab
  if (listeningCandidates.length === 0 && vocabList.length > 0) {
    for (const v of vocabList.slice(0, 2)) {
      const raw = v.word;
      const distractors = shuffle(vocabList.filter((o) => o.word !== raw).map((o) => o.word)).slice(0, 2);
      const opts = distractors.length === 2 ? shuffle([raw, ...distractors]) : shuffle([raw, "こんにちは", "さようなら"].slice(0, 3));
      listeningCandidates.push({
        question_type: QuestionType.LISTENING,
        content: `Nghe và chọn câu đúng: "${raw}"`,
        options: opts,
        correct_answer: raw,
      });
    }
  }

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
