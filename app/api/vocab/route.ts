import { NextRequest, NextResponse } from "next/server";
import { getCachedVocab } from "@/lib/cache";
import { lookupVocabSmart } from "@/lib/vocabLookup";
import { fuzzyContains, normalizeSearch } from "@/lib/search";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, rateKey, rateLimitedResponse, sweepRateBuckets, RATE_PRESETS } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  // Giữ public cho tooltip hover, nhưng khách vãng lai 15/phút (miss cache là gọi
  // Gemini + ghi DB nên phải bóp), user đăng nhập 60/phút.
  const me = await getCurrentUser(req as unknown as Request).catch(() => null);
  const preset = me ? RATE_PRESETS.standard : RATE_PRESETS.anon;
  const rl = checkRateLimit(rateKey(req as unknown as Request, "vocab", me?.id), preset.limit, preset.windowMs);
  sweepRateBuckets();
  if (!rl.allowed) return rateLimitedResponse(rl.resetMs);
  const url = new URL(req.url);
  // Gần đúng: hỗ trợ `search` / `q` / `query` → fuzzyContains (bỏ dấu, lower, tách từ)
  const searchParam =
    url.searchParams.get("search")?.trim() ||
    url.searchParams.get("q")?.trim() ||
    url.searchParams.get("query")?.trim() ||
    undefined;

  if (searchParam) {
    if (searchParam.length > 100) {
      return NextResponse.json({ error: "Từ khóa quá dài (tối đa 100 ký tự)" }, { status: 400 });
    }
    const normKey = normalizeSearch(searchParam);
    const cacheKey = `vocab:search:${normKey}`;
    const vocabs = await getCachedVocab(cacheKey, async () => {
      // Lấy tối đa 200 để không nặng DB, sau đó lọc gần đúng trong memory
      // Dùng fuzzyContains = normalize + toLowerCase().includes() + tách từ
      const all = await prisma.vocabulary.findMany({ take: 200, orderBy: { id: "asc" } });
      return all.filter((v) => {
        const hay = `${v.word} ${v.reading} ${v.meaning}`;
        return fuzzyContains(hay, searchParam) || fuzzyContains(v.word, searchParam);
      });
    });

    const list = (vocabs as unknown[]) ?? [];
    if (list.length === 0) {
      return NextResponse.json({ found: false, search: searchParam, vocabs: [] }, { status: 404 });
    }
    return NextResponse.json(
      { found: true, search: searchParam, vocabs: list },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  }

  const word = url.searchParams.get("word")?.trim();
  const reading = url.searchParams.get("reading")?.trim() || undefined;
  const sample = url.searchParams.get("sample")?.trim() || undefined;
  if (!word) {
    return NextResponse.json({ error: "Thiếu word" }, { status: 400 });
  }
  if (word.length > 100 || (reading?.length ?? 0) > 100 || (sample?.length ?? 0) > 2000) {
    return NextResponse.json({ error: "Tham số quá dài (word ≤100, sample ≤2000)" }, { status: 400 });
  }

  // DB → Gemini theo ngữ cảnh (dùng chung helper với Server Action tooltip)
  const vocab = await lookupVocabSmart(word, { reading, sample });

  if (!vocab) {
    return NextResponse.json({ found: false, word, reading: reading ?? null }, { status: 404 });
  }

  return NextResponse.json(
    { found: true, vocab },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
