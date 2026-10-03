import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import KanjiCanvas, { type KanjiItem } from "@/components/KanjiCanvas";
import Pagination from "@/components/Pagination";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function extractKanjiItems(
  vocabs: Array<{ word: string; reading: string; meaning: string; level: string }>
): KanjiItem[] {
  const map = new Map<string, KanjiItem & { count: number }>();
  const kanjiRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g;
  for (const v of vocabs) {
    const chars = v.word.match(kanjiRegex);
    if (!chars) continue;
    for (const ch of chars) {
      const existing = map.get(ch);
      if (!existing) {
        map.set(ch, {
          kanji: ch,
          reading: v.reading,
          meaning: v.meaning,
          sampleWord: v.word,
          level: v.level,
          count: 1,
        });
      } else {
        existing.count += 1;
      }
    }
  }
  const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);
  return sorted.slice(0, 100).map(({ count: _count, ...rest }) => rest);
}

const FALLBACK_KANJI: KanjiItem[] = [
  { kanji: "耳", reading: "みみ", meaning: "tai", sampleWord: "耳", level: "N5" },
  { kanji: "見", reading: "みる", meaning: "nhìn", sampleWord: "見る", level: "N5" },
  { kanji: "学", reading: "がく", meaning: "học", sampleWord: "学校", level: "N5" },
  { kanji: "水", reading: "みず", meaning: "nước", sampleWord: "水", level: "N5" },
  { kanji: "日", reading: "ひ", meaning: "ngày / mặt trời", sampleWord: "日本", level: "N5" },
  { kanji: "本", reading: "ほん", meaning: "sách / gốc", sampleWord: "本", level: "N5" },
  { kanji: "人", reading: "ひと", meaning: "người", sampleWord: "人", level: "N5" },
  { kanji: "大", reading: "だい", meaning: "lớn", sampleWord: "大学", level: "N5" },
  { kanji: "山", reading: "やま", meaning: "núi", sampleWord: "山", level: "N5" },
  { kanji: "川", reading: "かわ", meaning: "sông", sampleWord: "川", level: "N5" },
];

const VALID_LEVELS: Record<string, true> = { N5: true, N4: true, N3: true, N2: true, N1: true };

export default async function KanjiPage({
  searchParams,
}: {
  searchParams?: Promise<{ level?: string | string[]; page?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const sp = searchParams ? await searchParams : undefined;
  const rawLevel =
    typeof sp?.level === "string" ? sp.level : Array.isArray(sp?.level) ? sp.level[0] : undefined;
  const selectedLevel = rawLevel && VALID_LEVELS[rawLevel] ? rawLevel : null;

  const rawPage = typeof sp?.page === "string" ? sp.page : Array.isArray(sp?.page) ? sp.page[0] : undefined;
  const pageParsed = Number.parseInt(rawPage || "1", 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  let vocabs: Array<{ word: string; reading: string; meaning: string; level: string }> = [];
  try {
    vocabs = await prisma.vocabulary.findMany({
      select: { word: true, reading: true, meaning: true, level: true },
      orderBy: { id: "asc" },
    });
  } catch {
    vocabs = [];
  }

  const filteredVocabs = selectedLevel ? vocabs.filter((v) => v.level === selectedLevel) : vocabs;

  let kanjiList = extractKanjiItems(filteredVocabs);
  if (kanjiList.length === 0) {
    if (selectedLevel) {
      const fallbackFiltered = FALLBACK_KANJI.filter((k) => k.level === selectedLevel);
      kanjiList = fallbackFiltered;
    } else {
      kanjiList = FALLBACK_KANJI;
    }
  }

  // Pagination after extractKanjiItems đã lọc level
  const totalPages = Math.max(1, Math.ceil(kanjiList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * PAGE_SIZE;
  const kanjiListPaginated = kanjiList.slice(skip, skip + PAGE_SIZE);

  let progressMap: Record<string, { attempts: number; mastered: boolean }> = {};
  try {
    const progresses = await prisma.kanjiProgress.findMany({
      where: { user_id: user.id },
      select: { kanji: true, attempts: true, mastered: true },
    });
    for (const p of progresses) {
      progressMap[p.kanji] = { attempts: p.attempts, mastered: p.mastered };
    }
  } catch {
    progressMap = {};
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Luyện viết Kanji</h1>
          <p className="mt-1 text-xs text-sakura-600">
            {kanjiList.length} chữ • {Object.keys(progressMap).length} đã luyện
            {selectedLevel ? ` • ${selectedLevel}` : ""} • Trang {safePage}/{totalPages}
          </p>
        </div>
        <span className="rounded-full bg-white border border-sakura-200 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
          {user.name} • Kanji
        </span>
      </div>

      <KanjiCanvas kanjiList={kanjiListPaginated} progressMap={progressMap} selectedLevel={selectedLevel} />

      <Pagination currentPage={safePage} totalPages={totalPages} />
    </div>
  );
}
