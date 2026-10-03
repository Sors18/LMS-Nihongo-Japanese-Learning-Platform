"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { bustVocabCache } from "@/lib/vocabLookup";
import { revalidatePath } from "next/cache";
import type { Level } from "@prisma/client";

const VALID_LEVELS: Level[] = ["N5", "N4", "N3", "N2", "N1"];

type ActionResult<T = unknown> =
  | ({ ok: true } & T & Record<string, unknown>)
  | { ok: false; error: string };

function handleAuthError(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Unauthorized") return { ok: false as const, error: "Unauthorized — vui lòng đăng nhập" };
  if (msg === "Forbidden") return { ok: false as const, error: "Forbidden — chỉ ADMIN mới thực hiện được" };
  return { ok: false as const, error: msg };
}

function validateVocabFields(input: { word?: string; reading?: string; meaning?: string; level?: string }) {
  const word = String(input.word ?? "").trim();
  const reading = String(input.reading ?? "").trim();
  const meaning = String(input.meaning ?? "").trim();
  const levelRaw = String(input.level ?? "").trim().toUpperCase();

  if (!word) return { error: "word không được để trống" } as const;
  if (!reading) return { error: "reading không được để trống" } as const;
  if (!meaning) return { error: "meaning không được để trống" } as const;
  const levelIsValid = (VALID_LEVELS as string[]).includes(levelRaw);
  if (!levelRaw || !levelIsValid) return { error: "Level không hợp lệ — chỉ N5..N1" } as const;

  return { word, reading, meaning, level: levelRaw as Level } as const;
}

function parseId(id: unknown): number | null {
  if (id === null || id === undefined) return null;
  if (typeof id === "number") return Number.isFinite(id) && id > 0 ? Math.floor(id) : null;
  if (typeof id === "string") {
    const n = Number(id.trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  if (typeof id === "object" && id !== null) {
    // Narrow with `in` to avoid inline-cast member access
    if ("id" in id) {
      const cand = (id as { id: unknown }).id;
      if (cand !== undefined) return parseId(cand);
    }
    if ("vocabId" in id) {
      const cand = (id as { vocabId: unknown }).vocabId;
      if (cand !== undefined) return parseId(cand);
    }
    if ("vocabularyId" in id) {
      const cand = (id as { vocabularyId: unknown }).vocabularyId;
      if (cand !== undefined) return parseId(cand);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// listVocabs(q, level)
// ---------------------------------------------------------------------------
export async function listVocabs(
  q?: string | { q?: string; level?: string; query?: string; search?: string; word?: string },
  level?: string
): Promise<ActionResult<{ vocabs: unknown[] }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  // Normalize args: support (q, level) and ({q,level}) and ({query}) etc.
  let queryStr = "";
  let levelStr: string | undefined = level;

  if (typeof q === "object" && q !== null) {
    // q is object form — safely read optional fields via `in` checks
    let qObjLevel: unknown = undefined;
    let qVal: unknown = undefined;
    if ("level" in q) qObjLevel = q.level;
    if ("q" in q) qVal = q.q;
    else if ("query" in q) qVal = q.query;
    else if ("search" in q) qVal = q.search;
    else if ("word" in q) qVal = q.word;
    queryStr = String(qVal ?? "");
    if (qObjLevel !== undefined) levelStr = String(qObjLevel);
  } else if (typeof q === "string") {
    queryStr = q;
  } else if (q !== undefined && q !== null) {
    queryStr = String(q);
  }

  const qTrim = queryStr.trim();
  const lvlTrim = levelStr !== undefined && levelStr !== null ? String(levelStr).trim().toUpperCase() : "";

  const lvlIsValid = !lvlTrim || (VALID_LEVELS as string[]).includes(lvlTrim);
  if (lvlTrim && !lvlIsValid) {
    return { ok: false as const, error: "Level không hợp lệ — chỉ N5..N1" };
  }

  try {
    const where: Record<string, unknown> = {};

    if (qTrim && lvlTrim) {
      // both filters: (word OR reading OR meaning contains q) AND level
      where["AND"] = [
        {
          OR: [
            { word: { contains: qTrim } },
            { reading: { contains: qTrim } },
            { meaning: { contains: qTrim } },
          ],
        },
        { level: lvlTrim },
      ];
    } else if (qTrim) {
      where["OR"] = [
        { word: { contains: qTrim } },
        { reading: { contains: qTrim } },
        { meaning: { contains: qTrim } },
      ];
    } else if (lvlTrim) {
      where["level"] = lvlTrim;
    }

    const vocabs = await prisma.vocabulary.findMany({
      where: where as never,
      orderBy: { id: "desc" },
    });

    return { ok: true as const, vocabs };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
// ---------------------------------------------------------------------------
// createVocab({word, reading, meaning, level})
// ---------------------------------------------------------------------------
export async function createVocab(
  data: { word: string; reading: string; meaning: string; level: string } | string,
  reading?: string,
  meaning?: string,
  level?: string
): Promise<ActionResult<{ vocab: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  // Normalize: handle ({word,...}) or (word, reading, meaning, level)
  let input: { word?: string; reading?: string; meaning?: string; level?: string };
  const isObject = typeof data === "object" && data !== null;
  const hasWord = isObject && "word" in data;
  if (hasWord) {
    const dataObj = data as { word?: unknown; reading?: unknown; meaning?: unknown; level?: unknown }; // vocab payload from admin form
    input = {
      word: String(dataObj.word ?? ""),
      reading: String(dataObj.reading ?? ""),
      meaning: String(dataObj.meaning ?? ""),
      level: String(dataObj.level ?? ""),
    };
  } else if (typeof data === "string") {
    input = { word: data, reading: reading ?? "", meaning: meaning ?? "", level: level ?? "" };
  } else {
    return { ok: false as const, error: "Thiếu tham số word/reading/meaning/level" };
  }

  const validated = validateVocabFields(input);
  if ("error" in validated) {
    return { ok: false as const, error: String(validated.error) };
  }

  const { word, reading: rd, meaning: mn, level: lv } = validated;

  try {
    const dup = await prisma.vocabulary.findFirst({
      where: { word, reading: rd },
    });
    if (dup) {
      return { ok: false as const, error: "Từ vựng đã tồn tại (word + reading trùng)" };
    }

    const vocab = await prisma.vocabulary.create({
      data: { word, reading: rd, meaning: mn, level: lv },
    });

    // Từ mới/xóa/sửa → bust cache lookup để tooltip/hover hiện đúng ngay
    bustVocabCache();
    revalidatePath("/admin/vocab");
    revalidatePath("/admin/videos");

    return { ok: true as const, vocab };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
export async function updateVocab(
  id: number | string | { id: number | string; word?: string; reading?: string; meaning?: string; level?: string },
  data?: { word: string; reading: string; meaning: string; level: string } | string,
  reading?: string,
  meaning?: string,
  level?: string
): Promise<ActionResult<{ vocab: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  // Normalize id & payload — support multiple call shapes for robustness
  let vocabId: number | null = null;
  let payload: { word?: string; reading?: string; meaning?: string; level?: string } | undefined;

  const idIsObject = typeof id === "object" && id !== null && "id" in id;
  if (idIsObject) {
    const idObj = id as { id: unknown; word?: unknown; reading?: unknown; meaning?: unknown; level?: unknown }; // admin id+payload combined
    vocabId = parseId(idObj.id);
    const hasPayloadInId =
      "word" in id || "reading" in id || "meaning" in id || "level" in id;
    if (hasPayloadInId) {
      payload = {
        word: String(idObj.word ?? ""),
        reading: String(idObj.reading ?? ""),
        meaning: String(idObj.meaning ?? ""),
        level: String(idObj.level ?? ""),
      };
    }
    if (data !== undefined) {
      const dataIsPayloadObj = typeof data === "object" && data !== null && "word" in data;
      if (dataIsPayloadObj) {
        const dObj = data as { word?: unknown; reading?: unknown; meaning?: unknown; level?: unknown }; // payload override
        payload = {
          word: String(dObj.word ?? ""),
          reading: String(dObj.reading ?? ""),
          meaning: String(dObj.meaning ?? ""),
          level: String(dObj.level ?? ""),
        };
      } else if (typeof data === "string") {
        payload = { word: data, reading: reading ?? "", meaning: meaning ?? "", level: level ?? "" };
      } else if (payload === undefined) {
        const dObj2 = data as { word?: unknown; reading?: unknown; meaning?: unknown; level?: unknown } | undefined;
        if (dObj2 && typeof dObj2 === "object") {
          payload = {
            word: String(dObj2.word ?? ""),
            reading: String(dObj2.reading ?? ""),
            meaning: String(dObj2.meaning ?? ""),
            level: String(dObj2.level ?? ""),
          };
        }
      }
    }
  } else {
    vocabId = parseId(id);
    if (data !== undefined) {
      const dataIsPayloadObj = typeof data === "object" && data !== null && "word" in data;
      if (dataIsPayloadObj) {
        const dObj = data as { word?: unknown; reading?: unknown; meaning?: unknown; level?: unknown }; // vocab payload
        payload = {
          word: String(dObj.word ?? ""),
          reading: String(dObj.reading ?? ""),
          meaning: String(dObj.meaning ?? ""),
          level: String(dObj.level ?? ""),
        };
      } else if (typeof data === "string") {
        payload = { word: data, reading: reading ?? "", meaning: meaning ?? "", level: level ?? "" };
      } else {
        const dObj2 = data as { word?: unknown; reading?: unknown; meaning?: unknown; level?: unknown } | undefined;
        if (dObj2 && typeof dObj2 === "object") {
          payload = {
            word: String(dObj2.word ?? ""),
            reading: String(dObj2.reading ?? ""),
            meaning: String(dObj2.meaning ?? ""),
            level: String(dObj2.level ?? ""),
          };
        }
      }
    }
  }

  if (!vocabId) return { ok: false as const, error: "Thiếu id hoặc id không hợp lệ" };
  if (!payload) return { ok: false as const, error: "Thiếu tham số word/reading/meaning/level" };

  const validated = validateVocabFields(payload);
  if ("error" in validated) {
    return { ok: false as const, error: String(validated.error) };
  }

  const { word, reading: rd, meaning: mn, level: lv } = validated;

  try {
    const existing = await prisma.vocabulary.findUnique({ where: { id: vocabId } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy từ vựng" };

    const dup = await prisma.vocabulary.findFirst({
      where: { word, reading: rd, NOT: { id: vocabId } },
    });
    if (dup) {
      return { ok: false as const, error: "Từ vựng đã tồn tại (word + reading trùng)" };
    }

    const updated = await prisma.vocabulary.update({
      where: { id: vocabId },
      data: { word, reading: rd, meaning: mn, level: lv },
    });

    // Bust cache lookup để tooltip/hover hiện bản sửa ngay
    bustVocabCache();
    revalidatePath("/admin/vocab");
    revalidatePath("/admin/videos");

    return { ok: true as const, vocab: updated };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// deleteVocab(id)
// ---------------------------------------------------------------------------
export async function deleteVocab(
  id: number | string | { id: number | string; vocabId?: number | string; vocabularyId?: number | string }
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  const vocabId = parseId(id);
  if (!vocabId) return { ok: false as const, error: "Thiếu id hoặc id không hợp lệ" };

  try {
    const existing = await prisma.vocabulary.findUnique({ where: { id: vocabId } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy từ vựng" };

    await prisma.vocabulary.delete({ where: { id: vocabId } });

    bustVocabCache();
    revalidatePath("/admin/vocab");
    revalidatePath("/admin/videos");

    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// getVocab(id) — extra helper to reach 5 actions (optional but useful for admin UI)
// ---------------------------------------------------------------------------
export async function getVocab(
  id: number | string | { id: number | string }
): Promise<ActionResult<{ vocab: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  const vocabId = parseId(id);
  if (!vocabId) return { ok: false as const, error: "Thiếu id hoặc id không hợp lệ" };

  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id: vocabId } });
    if (!vocab) return { ok: false as const, error: "Không tìm thấy từ vựng" };
    return { ok: true as const, vocab };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
