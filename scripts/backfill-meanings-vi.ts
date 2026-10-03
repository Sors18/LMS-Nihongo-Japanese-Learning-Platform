/**
 * Dọn nghĩa cũ trong DB về tiếng Việt thuần (offline, không gọi API):
 * "em bé (baby)" → "em bé". Chạy 1 lần: npx tsx scripts/backfill-meanings-vi.ts
 */
import { prisma } from "../lib/prisma";
import { normalizeMeaningVi } from "../lib/meaningVi";

async function main() {
  const rows = await prisma.vocabulary.findMany({ select: { id: true, word: true, meaning: true } });
  let fixed = 0;
  const skippedEnOnly: Array<{ id: number; word: string; meaning: string }> = [];
  for (const r of rows) {
    const clean = normalizeMeaningVi(r.meaning, r.word);
    if (clean && clean !== r.meaning) {
      await prisma.vocabulary.update({ where: { id: r.id }, data: { meaning: clean.slice(0, 500) } });
      fixed++;
    } else if (clean === "") {
      skippedEnOnly.push({ id: r.id, word: r.word, meaning: r.meaning });
    }
  }
  console.log(`[backfill] tổng ${rows.length} từ • đã chuẩn hóa ${fixed} • rỗng/không sửa được ${skippedEnOnly.length}`);
  for (const s of skippedEnOnly.slice(0, 20)) {
    console.log(`  - #${s.id} ${s.word}: "${s.meaning.slice(0, 80)}" (cần quét lại bằng Gemini)`);
  }
}

main()
  .catch((e) => {
    console.error("[backfill] FAIL:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
