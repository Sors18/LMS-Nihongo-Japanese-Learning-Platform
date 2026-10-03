import "server-only";

import { normalizeMeaningVi, isEnglishOnlyMeaning, isStaleGuessedNameMeaning } from "./meaningVi";
// ---------------------------------------------------------------------------
// Gemini — giải nghĩa từ vựng Nhật → Việt theo ngữ cảnh (thay Jisho+MyMemory)// - 1 API call xử lý cả batch (30 từ/chunk, sequential để tôn trọng rate limit)
// - Không có GEMINI_API_KEY hoặc API lỗi → trả Map rỗng, caller tự fallback Jisho
// - Không dependency mới: gọi REST generateContent trực tiếp qua fetch
// ---------------------------------------------------------------------------

export type GeminiVocabItem = {
  word: string;
  reading?: string;
  pos?: string;
  /** câu phụ đề mẫu chứa từ — để AI chọn nghĩa đúng ngữ cảnh */
  sample?: string | null;
};

export type GeminiVocabResult = {
  basic_form: string;
  meaning: string;
  level: string | null;
  /** Cách đọc kana đúng (đặc biệt tên riêng dùng nanori, VD 乙骨→おっこつ) — null nếu không chắc */
  reading?: string | null;
};

const MODEL = (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite").trim() || "gemini-3.5-flash-lite";
const CHUNK_SIZE = 40;
const GRAMMAR_CHUNK = 25;
/** Số chunk Gemini chạy song song — tăng tốc trích xuất video dài */
const GEMINI_CONCURRENCY = 4;

const LEVEL_RE = /^(N5|N4|N3|N2|N1)$/;

// Cache theo server lifetime — từ đã giải nghĩa không gọi lại
const geminiCache = new Map<string, GeminiVocabResult | null>();

/** Báo tiến trình theo chunk: done/total số chunk đã xong */
export type ChunkProgressFn = (done: number, total: number) => void;
/** Báo tiến trình theo giai đoạn pipeline — route SSE dịch thành phần trăm */
export type StageProgressFn = (stage: string, done: number, total: number) => void;

async function mapPool<T>(chunks: T[][], fn: (chunk: T[], index: number) => Promise<void>, onProgress?: ChunkProgressFn): Promise<void> {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(GEMINI_CONCURRENCY, chunks.length) }, async () => {
    while (next < chunks.length) {
      const i = next++;
      await fn(chunks[i], i);
      done++;
      onProgress?.(done, chunks.length);
    }
  });
  await Promise.all(workers);
}

function buildPrompt(items: GeminiVocabItem[]): string {
  const list = items.map((it, i) => ({
    id: i,
    word: it.word,
    reading: it.reading || null,
    pos: it.pos || null,
    sample: it.sample || null,
  }));
  return [
    "Bạn là từ điển Nhật–Việt cho người học tiếng Nhật.",
    "Với mỗi từ dưới đây, trả về JSON array, mỗi phần tử:",
    '{"id": <số>, "basic_form": "<thể nguyên mẫu>", "meaning_vi": "<nghĩa>", "level": "<N5|N4|N3|N2|N1>", "reading_kana": "<cách đọc hiragana hoặc null>"}',
    "Quy tắc:",
    "- meaning_vi: CHỈ tiếng Việt tự nhiên, tối đa 12 từ, ưu tiên nghĩa hợp với câu sample nếu có. CẤM chêm tiếng Anh (không viết kiểu 'nghĩa Việt (english)').",
    "- sample có thể kèm bản dịch Việt (dòng VI:) — DÙNG BẢN DỊCH để chốt nghĩa đúng ngữ cảnh, kể cả tên chiêu thức/địa danh (VD sample có VI 'lãnh địa' thì 領域 là lãnh địa).",
    "- basic_form: giữ nguyên mặt chữ từ điển (kanji/kana của từ), KHÔNG phiên âm sang katakana hay romaji.",
    "- Tên người Nhật: phiên âm Hepburn CHUẨN (Okkotsu, không Yukkotsu; Yuta, không Yuuta) + tên tác phẩm nếu nhận ra từ sample (VD: 'Okkotsu — nhân vật Jujutsu Kaisen'). CẤM viết chung chung 'nhân vật trong truyện'.",
    "- reading_kana: cách đọc hiragana ĐÚNG của từ trong câu sample (tên riêng dùng nanori: 乙骨→おっこつ, 憂太→ゆうた, 漏瑚→じょうご, 花御→はなみ); chiêu thức kanji dài đọc đặc biệt, KHÔNG ghép on'yomi từng chữ (嵌合暗翳庭→かんごうあんえいてい, CẤM ハマゴウアンエイニワ); không chắc thì null, CẤM đoán bừa (VD 漏瑚 CẤM đọc ろうこ).",
    "- Tên chiêu thức/thuật thức: meaning_vi giữ tên romaji + chú thích Việt ngắn (VD 'Kango An'eitei — lãnh địa của Megumi'). CẤM dịch từng chữ Hán sang âm Hán-Việt (cấm kiểu 'Khảm Hợp Ám Ế Đình').",
    "- Tên riêng khác (VTuber, địa danh), từ lóng, tiếng cảm thán kéo dài: giữ nguyên tên + chú thích tiếng Việt ngắn 3-5 từ.",
    "- Từ là danh từ tiếng Anh: giữ nguyên từ rồi giải thích bằng tiếng Việt đằng sau (VD: 'YouTube — trang chia sẻ video').",
    "- level BẮT BUỘC là một trong đúng 5 giá trị N5,N4,N3,N2,N1 — cấm ghi giá trị khác.",
    "Chỉ trả về JSON array thuần, không markdown, không giải thích.",
    JSON.stringify(list),
  ].join("\n");
}

function extractJsonArray(text: string): unknown[] | null {
  const t = text.replace(/```json|```/g, "").trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function resolveChunk(key: string, items: GeminiVocabItem[]): Promise<void> {
  let text = "";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(items) }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 4096 },
        }),
      }
    );
    if (!res.ok) return;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    for (const p of json.candidates?.[0]?.content?.parts ?? []) {
      if (p.text) text += p.text;
    }
  } catch {
    return;
  }
  const arr = extractJsonArray(text);
  if (!arr) return;
  arr.forEach((raw, i) => {
    const r = raw as { id?: number; basic_form?: string; meaning_vi?: string; level?: string; reading_kana?: string };
    const idx = typeof r.id === "number" ? r.id : i;
    const item = items[idx];
    if (!item) return;
    const meaningRaw = (r.meaning_vi ?? "").trim().slice(0, 180);
    if (!meaningRaw) return;
    // Chuẩn hóa Việt thuần ngay tại nguồn (cắt đuôi EN nếu model vẫn chêm)
    const meaning = normalizeMeaningVi(meaningRaw, item.word);
    if (!meaning) return;
    const readingKana = (r.reading_kana ?? "").trim();
    geminiCache.set(item.word, {
      basic_form: (r.basic_form ?? "").trim() || item.word,
      meaning,
      level: r.level && LEVEL_RE.test(r.level) ? r.level : null,
      reading: /^[぀-ゖー]+$/.test(readingKana) ? readingKana : null,
    });
  });
}

/**
 * Giải nghĩa cả batch bằng Gemini. Trả Map word → kết quả.
 * Từ nào không có trong Map = chưa cache được (thiếu key / API lỗi) → caller fallback Jisho.
 */
export async function resolveVocabMeanings(
  items: GeminiVocabItem[],
  onProgress?: ChunkProgressFn
): Promise<Map<string, GeminiVocabResult>> {
  const out = new Map<string, GeminiVocabResult>();
  const todo = items.filter((it) => {
    const w = (it.word ?? "").trim();
    if (!w) return false;
    if (geminiCache.has(w)) {
      const hit = geminiCache.get(w);
      // Entry hỏng từ prompt cũ (nghĩa EN / tên đoán mò) → bỏ, tra lại
      if (hit && (isEnglishOnlyMeaning(hit.meaning) || isStaleGuessedNameMeaning(hit.meaning))) {
        geminiCache.delete(w);
        return true;
      }
      if (hit) out.set(w, hit);
      return false;
    }
    return true;
  });
  if (todo.length === 0) return out;
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) return out;
  const chunks: GeminiVocabItem[][] = [];
  for (let i = 0; i < todo.length; i += CHUNK_SIZE) chunks.push(todo.slice(i, i + CHUNK_SIZE));
  await mapPool(chunks, (chunk) => resolveChunk(key, chunk), onProgress);
  for (const it of todo) {
    const hit = geminiCache.get(it.word);
    if (hit) out.set(it.word, hit);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ngữ pháp — phát hiện mẫu ngữ pháp theo ngữ cảnh (thay string-matching)
// ---------------------------------------------------------------------------

export type GeminiGrammarItem = {
  id: number;
  text: string;
};

export type GeminiGrammarPoint = {
  structure: string;
  explanation: string;
  level: string | null;
};

function buildGrammarPrompt(items: GeminiGrammarItem[]): string {
  const list = items.map((it) => ({ id: it.id, text: it.text }));
  return [
    "Bạn là giáo viên ngữ pháp tiếng Nhật.",
    "Với mỗi câu dưới đây, liệt kê các mẫu ngữ pháp đáng học, trả về JSON array:",
    '{"id": <số>, "points": [{"structure": "<mẫu chuẩn dạng 〜>", "explanation_vi": "<nghĩa>", "level": "<N5..N1>"}]}',
    "Quy tắc:",
    "- structure: dạng chuẩn với 〜 thay phần biến đổi (VD: 〜ている, 〜てしまう, 〜って (trích dẫn), 〜れ (thể mệnh lệnh)).",
    "- explanation_vi: tiếng Việt, tối đa 15 từ, nêu nghĩa và cách dùng trong câu này.",
    "- level BẮT BUỘC là một trong đúng 5 giá trị N5,N4,N3,N2,N1 — cấm ghi giá trị khác.",
    "- Bỏ qua câu không phải tiếng Nhật, câu quá ngắn không có mẫu đáng học: points rỗng.",
    "- Tối đa 4 points mỗi câu, chỉ lấy mẫu thực sự xuất hiện.",
    "Chỉ trả về JSON array thuần, không markdown, không giải thích.",
    JSON.stringify(list),
  ].join("\n");
}

async function detectGrammarChunk(
  key: string,
  model: string,
  items: GeminiGrammarItem[],
  out: Map<number, GeminiGrammarPoint[]>
): Promise<void> {
  let text = "";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildGrammarPrompt(items) }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 8192 },
        }),
      }
    );
    if (!res.ok) return;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    for (const p of json.candidates?.[0]?.content?.parts ?? []) {
      if (p.text) text += p.text;
    }
  } catch {
    return;
  }
  const arr = extractJsonArray(text);
  if (!arr) return;
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const raw of arr) {
    const r = raw as { id?: number; points?: Array<{ structure?: string; explanation_vi?: string; level?: string }> };
    if (typeof r.id !== "number" || !byId.has(r.id) || !Array.isArray(r.points)) continue;
    const points: GeminiGrammarPoint[] = [];
    for (const p of r.points.slice(0, 4)) {
      const structure = (p.structure ?? "").trim().slice(0, 60);
      const explanation = (p.explanation_vi ?? "").trim().slice(0, 200);
      if (!structure || !explanation) continue;
      points.push({ structure, explanation, level: p.level && LEVEL_RE.test(p.level) ? p.level : null });
    }
    if (points.length > 0) out.set(r.id, points);
  }
}

/**
 * Phát hiện ngữ pháp cho cả batch phụ đề. Trả Map subtitleId → points.
 * Thiếu key / API lỗi → Map rỗng, caller dùng matcher cũ.
 */
export async function detectGrammarPoints(
  items: GeminiGrammarItem[],
  onProgress?: ChunkProgressFn
): Promise<Map<number, GeminiGrammarPoint[]>> {
  const out = new Map<number, GeminiGrammarPoint[]>();
  const todo = items.filter((it) => (it.text ?? "").trim() !== "");
  if (todo.length === 0) return out;
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) return out;
  const chunks: GeminiGrammarItem[][] = [];
  for (let i = 0; i < todo.length; i += GRAMMAR_CHUNK) chunks.push(todo.slice(i, i + GRAMMAR_CHUNK));
  await mapPool(chunks, (chunk) => detectGrammarChunk(key, MODEL, chunk, out), onProgress);
  return out;
}

