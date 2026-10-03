import { prisma, isMissingColumnError } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import FlashcardDeck from "@/components/FlashcardDeck";
import Pagination from "@/components/Pagination";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = searchParams ? await searchParams : undefined;
  const rawPage = typeof sp?.page === "string" ? sp.page : Array.isArray(sp?.page) ? sp.page[0] : undefined;
  const pageParsed = Number.parseInt(rawPage || "1", 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  // Query KHÔNG orderBy due_at để không nổ P2022 khi DB chưa migrate SRS;
  // sort "đến hạn trước" bằng JS bên dưới (có field thì dùng, chưa có thì giữ created desc).
  // NOTE: Prisma Client mới SELECT cả cột due_at → DB chưa migrate vẫn nổ P2022:
  // bắt lỗi rồi query lại chỉ cột cũ.
  let flashcards;
  try {
    flashcards = await prisma.flashcard.findMany({
      where: { user_id: user.id },
      include: { vocabulary: true },
      orderBy: { created_at: "desc" },
    });
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    flashcards = await prisma.flashcard.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        user_id: true,
        vocab_id: true,
        video_context_id: true,
        status: true,
        created_at: true,
        updated_at: true,
        vocabulary: true,
      },
    });
  }

  const now = Date.now();
  // Serialize for client component (Date objects -> iso, ensure plain)
  const serialized = flashcards.map((f) => {
    const r = f as unknown as Record<string, unknown>;
    const dueRaw = r["due_at"];
    const dueIso = dueRaw instanceof Date ? dueRaw.toISOString() : null;
    const isDue = dueIso ? new Date(dueIso).getTime() <= now : true;
    return {
      id: f.id,
      status: f.status,
      due_at: dueIso,
      isDue,
      interval: typeof r["interval"] === "number" ? (r["interval"] as number) : 0,
      vocabulary: {
        word: f.vocabulary.word,
        reading: f.vocabulary.reading,
        meaning: f.vocabulary.meaning,
        level: f.vocabulary.level,
      },
    };
  });

  // Sort "đến hạn trước" bằng JS — an toàn kể cả khi DB chưa có cột due_at
  // (có due_at thì due trước, chưa có thì giữ nguyên created desc).
  serialized.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    if (a.due_at && b.due_at) return a.due_at < b.due_at ? -1 : 1;
    return 0;
  });

  // Paginate filtered list — currently filtered list = serialized (client filter by status handled in FlashcardDeck, here paginate overall)
  // Keep search/filter in UI: Deck handles status filter, pagination slice below keeps URL ?page=
  const totalPages = Math.max(1, Math.ceil(serialized.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * PAGE_SIZE;
  const paginated = serialized.slice(skip, skip + PAGE_SIZE);

  // For filtered list pagination inside Deck, Deck will re-paginate filtered subset with same PAGE_SIZE
  // Pass full serialized to Deck so Deck can correctly paginate filtered list (status filter then paginate)
  // Keep paginated variable for build check and header display; Deck receives full to handle filtered pagination

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Flashcard của bạn</h1>
          <p className="mt-1 text-xs text-slate-500">
            Trang {safePage}/{totalPages} • {serialized.length} thẻ • Hiển thị {paginated.length} thẻ
          </p>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 border border-slate-700">
          {user.name} • {serialized.length} thẻ
        </span>
      </div>

      <FlashcardDeck flashcards={serialized} />

      <Pagination currentPage={safePage} totalPages={totalPages} />
    </div>
  );
}
