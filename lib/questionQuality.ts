import "server-only";

import { prisma } from "./prisma";
import { hasJapanese } from "./bilingual";
import { getKnownPersonNames, isNameOnlyLine } from "./properNames";

/**
 * Tập từ là tên người: map cứng (JJK...) + tên học được từ DB
 * (vocab có nghĩa "Tên người: ..." do pipeline proper-noun ghi).
 * Dùng để loại câu hỏi tên người khỏi đề — hỏi nghĩa tên / nghe tên
 * không có giá trị kiểm tra năng lực tiếng Nhật.
 */
export async function loadPersonWordSet(): Promise<Set<string>> {
  const set = new Set<string>(getKnownPersonNames());
  try {
    const rows = await prisma.vocabulary.findMany({
      where: { meaning: { startsWith: "Tên người:" } },
      select: { word: true },
      take: 500,
    });
    for (const r of rows) {
      const w = (r.word ?? "").trim();
      if (w) set.add(w);
    }
  } catch {
    // DB lỗi → vẫn còn map cứng
  }
  return set;
}

export type JunkQuestionRow = {
  id: number;
  question_type: string;
  content: string;
  options: unknown;
  correct_answer: string;
};

/** Tách từ hỏi trong content dạng「từ (reading)」の意味は？ */
function extractAskedWord(content: string): string | null {
  const m = /「(.+?)\s*\(/.exec(content ?? "");
  return m?.[1]?.trim() || null;
}

function toOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Câu rác = sub thuần Việt (không chữ Nhật) hoặc câu hỏi tên người.
 * Quy tắc theo loại:
 * - LISTENING: đáp án đúng không có chữ Nhật, hoặc chỉ là tên người.
 * - VOCAB_CHOICE: từ hỏi là tên người.
 * - FILL_PARTICLE: phần câu (bỏ ___ và gợi ý) không có chữ Nhật.
 */
export function isJunkQuestion(q: JunkQuestionRow, personWords: Set<string>): boolean {
  const type = (q.question_type ?? "").trim();
  const correct = (q.correct_answer ?? "").trim();

  if (type === "LISTENING") {
    if (!correct || !hasJapanese(correct)) return true;
    if (isNameOnlyLine(correct, personWords)) return true;
    return false;
  }

  if (type === "VOCAB_CHOICE") {
    const word = extractAskedWord(q.content);
    if (word && (personWords.has(word) || isNameOnlyLine(word, personWords))) return true;
    return false;
  }

  if (type === "FILL_PARTICLE") {
    const body = (q.content ?? "").replace(/___/g, "").replace(/\(điền trợ từ\)/gi, "").trim();
    if (!body || !hasJapanese(body)) return true;
    return false;
  }

  return false;
}

/** Lọc nghĩa tên người khỏi pool đáp án nhiễu (tên riêng làm nhiễu rất lộ). */
export function isPersonMeaning(meaning: string): boolean {
  return (meaning ?? "").trim().startsWith("Tên người:");
}

export { toOptions as parseQuestionOptions };
