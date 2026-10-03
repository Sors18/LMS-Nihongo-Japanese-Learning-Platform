"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Level } from "@prisma/client";

const VALID_LEVELS: Level[] = ["N5", "N4", "N3", "N2", "N1"];
const REVALIDATE_PATH = "/admin/grammar";

type ActionResult<T = unknown> = ({ ok: true } & T & Record<string, unknown>) | { ok: false; error: string };

function handleAuthError(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Unauthorized") return { ok: false as const, error: "Unauthorized — vui lòng đăng nhập" };
  if (msg === "Forbidden") return { ok: false as const, error: "Forbidden — chỉ ADMIN mới thực hiện được" };
  return { ok: false as const, error: msg };
}

 

function normalizeId(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n > 0) return n;
    return null;
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const cand = obj.id ?? obj.grammarId ?? obj.grammar_id;
    if (cand !== undefined) return normalizeId(cand);
  }
  return null;
}

function parseGrammarInput(input: unknown): { structure: string; explanation: string; level: string } | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  // support direct object {structure, explanation, level}
  const structure = typeof obj.structure === "string" ? obj.structure : "";
  const explanation = typeof obj.explanation === "string" ? obj.explanation : "";
  const level = typeof obj.level === "string" ? obj.level : "";
  return { structure, explanation, level };
}

// ============================================================
// listGrammars
// ============================================================
export async function listGrammars(): Promise<ActionResult<{ grammars: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }
  try {
    const grammars = await prisma.grammar.findMany({
      orderBy: { id: "desc" },
    });
    return { ok: true as const, grammars };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// getGrammar — helper for edit form (counts as 5th action)
// ============================================================
export async function getGrammar(
  id: number | string | { id: number | string }
): Promise<ActionResult<{ grammar: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  const gid = normalizeId(id);
  if (gid === null) return { ok: false as const, error: "Thiếu hoặc id không hợp lệ" };

  try {
    const grammar = await prisma.grammar.findUnique({ where: { id: gid } });
    if (!grammar) return { ok: false as const, error: "Không tìm thấy grammar" };
    return { ok: true as const, grammar };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// createGrammar
// ============================================================
export async function createGrammar(input: { structure: string; explanation: string; level: string }): Promise<ActionResult<{ grammar: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  const parsed = parseGrammarInput(input);
  if (!parsed) return { ok: false as const, error: "Thiếu tham số structure/explanation/level" };

  const structure = parsed.structure.trim();
  const explanation = parsed.explanation.trim();
  const level = parsed.level.trim().toUpperCase();

  if (!structure) return { ok: false as const, error: "Structure không được để trống" };
  if (!explanation) return { ok: false as const, error: "Explanation không được để trống" };
  if (!(VALID_LEVELS as unknown as string[]).includes(level)) return { ok: false as const, error: "Level không hợp lệ — chỉ N5..N1" };

  try {
    const dup = await prisma.grammar.findFirst({ where: { structure } });
    if (dup) return { ok: false as const, error: "Structure đã tồn tại" };

    const grammar = await prisma.grammar.create({
      data: {
        structure,
        explanation,
        level: level as Level,
      },
    });

    revalidatePath(REVALIDATE_PATH);
    return { ok: true as const, grammar };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// updateGrammar
// ============================================================
export async function updateGrammar(
  id: number | string | { id: number | string; structure?: string; explanation?: string; level?: string },
  data?: { structure: string; explanation: string; level: string }
): Promise<ActionResult<{ grammar: unknown }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  // Normalize: support updateGrammar(id, {structure, explanation, level}) and updateGrammar({id, structure, explanation, level})
  let gid: number | null = null;
  let payload: { structure: string; explanation: string; level: string } | null = null;

  if (data !== undefined) {
    gid = normalizeId(id);
    payload = parseGrammarInput(data);
  } else if (typeof id === "object" && id !== null) {
    const obj = id as Record<string, unknown>;
    gid = normalizeId(obj.id ?? obj.grammarId ?? obj.grammar_id);
    payload = parseGrammarInput(obj);
    // if payload came from same object, ensure we have fields
    if (payload && !payload.structure && typeof obj.structure === "string") payload.structure = obj.structure as string;
  } else {
    gid = normalizeId(id);
  }

  if (gid === null) return { ok: false as const, error: "Thiếu hoặc id không hợp lệ" };
  if (!payload) return { ok: false as const, error: "Thiếu tham số structure/explanation/level" };

  const structure = payload.structure.trim();
  const explanation = payload.explanation.trim();
  const level = payload.level.trim().toUpperCase();

  if (!structure) return { ok: false as const, error: "Structure không được để trống" };
  if (!explanation) return { ok: false as const, error: "Explanation không được để trống" };
  if (!(VALID_LEVELS as unknown as string[]).includes(level)) return { ok: false as const, error: "Level không hợp lệ — chỉ N5..N1" };

  try {
    const existing = await prisma.grammar.findUnique({ where: { id: gid } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy grammar" };

    const dup = await prisma.grammar.findFirst({ where: { structure } });
    if (dup && dup.id !== gid) return { ok: false as const, error: "Structure đã tồn tại" };

    const grammar = await prisma.grammar.update({
      where: { id: gid },
      data: {
        structure,
        explanation,
        level: level as Level,
      },
    });

    revalidatePath(REVALIDATE_PATH);
    return { ok: true as const, grammar };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// deleteGrammar
// ============================================================
export async function deleteGrammar(
  id: number | string | { id: number | string }
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  const gid = normalizeId(id);
  if (gid === null) return { ok: false as const, error: "Thiếu hoặc id không hợp lệ" };

  try {
    const existing = await prisma.grammar.findUnique({ where: { id: gid } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy grammar" };

    await prisma.grammar.delete({ where: { id: gid } });

    revalidatePath(REVALIDATE_PATH);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
