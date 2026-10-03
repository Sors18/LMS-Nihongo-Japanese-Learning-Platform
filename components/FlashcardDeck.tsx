"use client";

import { useState, useTransition } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { updateFlashcardStatus, deleteFlashcard, reviewFlashcard } from "@/app/actions/flashcard";
import { normalizeMeaningVi, formatReading } from "@/lib/meaningVi";
import Pagination from "@/components/Pagination";

type Flashcard = {
  id: number;
  status: string;
  due_at?: string | null;
  isDue?: boolean;
  interval?: number;
  vocabulary: {
    word: string;
    reading: string;
    meaning: string;
    level: string;
  };
};

type Props = {
  flashcards: Flashcard[];
};

const PAGE_SIZE = 12;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-white text-slate-700 border border-sakura-200",
    LEARNING: "bg-amber-50 text-amber-700 border border-amber-200",
    MASTERED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };
  const cls = map[status] ?? map.NEW;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}

export default function FlashcardDeck({ flashcards: initial }: Props) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<"ALL" | "DUE" | "NEW" | "LEARNING" | "MASTERED">("ALL");
  const [visible, setVisible] = useState<Flashcard[]>(initial);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const rawPage = searchParams.get("page");
  const pageParsed = Number.parseInt(rawPage || "1", 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  const flashcards = visible;
  const filtered =
    filter === "ALL"
      ? flashcards
      : filter === "DUE"
        ? flashcards.filter((c) => c.isDue ?? true)
        : flashcards.filter((c) => (optimistic[c.id] ?? c.status) === filter);

  // Paginate filtered list with PAGE_SIZE 12
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(skip, skip + PAGE_SIZE);

  const handleFilterChange = (next: "ALL" | "DUE" | "NEW" | "LEARNING" | "MASTERED") => {
    setFilter(next);
    // Reset page to 1 when filter changes, keep other query params
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.push(href, { scroll: false } as unknown as never);
  };

  const toggleFlip = (id: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatus = (id: number, status: string) => {
    setPendingId(id);
    setOptimistic((prev) => ({ ...prev, [id]: status }));
    startTransition(async () => {
      try {
        const res = await updateFlashcardStatus(
          id,
          status as "NEW" | "LEARNING" | "MASTERED"
        );
        if (!res.ok) {
          setOptimistic((prev) => {
            const n = { ...prev };
            delete n[id];
            return n;
          });
          alert(res.error ?? "Cập nhật thất bại");
        }
      } finally {
        setPendingId(null);
      }
    });
  };

  const handleReview = (id: number, quality: number) => {
    setPendingId(id);
    startTransition(async () => {
      try {
        const res = await reviewFlashcard(id, quality);
        if (!res.ok) {
          alert(res.error ?? "Chấm điểm thất bại");
        } else {
          // Đánh dấu đã review trong session: gỡ khỏi hàng đợi DUE
          setVisible((prev) =>
            prev.map((c) => (c.id === id ? { ...c, isDue: false, due_at: new Date(Date.now() + 86400000).toISOString() } : c))
          );
          setOptimistic((prev) => {
            const n = { ...prev };
            delete n[id];
            return n;
          });
        }
      } finally {
        setPendingId(null);
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Xóa flashcard này?")) return;
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteFlashcard(id);
      if (res.ok) {
        setVisible((prev) => prev.filter((c) => c.id !== id));
      } else {
        alert(res.error ?? "Xóa thất bại");
      }
      setPendingId(null);
    });
  };

  if (initial.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sakura-200 bg-white px-6 py-12 text-center shadow-sm">
        <p className="text-sm text-slate-700">Chưa có flashcard nào.</p>
        <p className="mt-1 text-xs text-slate-500">
          Xem video và bấm vào từ trong phụ đề để thêm flashcard.
        </p>
      </div>
    );
  }

  const counts = {
    ALL: flashcards.length,
    DUE: flashcards.filter((c) => c.isDue ?? true).length,
    NEW: flashcards.filter((c) => (optimistic[c.id] ?? c.status) === "NEW").length,
    LEARNING: flashcards.filter((c) => (optimistic[c.id] ?? c.status) === "LEARNING").length,
    MASTERED: flashcards.filter((c) => (optimistic[c.id] ?? c.status) === "MASTERED").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ["ALL", `Tất cả (${counts.ALL})`],
          ["DUE", `Đến hạn (${counts.DUE})`],
          ["NEW", `Chưa học (${counts.NEW})`],
          ["LEARNING", `Đang học (${counts.LEARNING})`],
          ["MASTERED", `Đã học (${counts.MASTERED})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => handleFilterChange(k)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${
              filter === k
                ? "bg-sakura-500 border-sakura-500 text-white shadow-sm"
                : "bg-white border-sakura-200 text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-sakura-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Không có thẻ nào ở mục này.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Hiển thị {paginated.length} / {filtered.length} thẻ • Trang {safePage}/{totalPages}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((card) => {
              const isFlipped = flipped.has(card.id);
              const currentStatus = optimistic[card.id] ?? card.status;
              const isPending = pendingId === card.id;
              return (
                <div key={card.id} className="group">
                  <div
                    className="relative h-48 cursor-pointer [perspective:900px]"
                    onClick={() => toggleFlip(card.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleFlip(card.id);
                      }
                    }}
                    aria-label={`Thẻ ${card.vocabulary.word} — bấm để lật`}
                  >
                    <div
                      className={`absolute inset-0 rounded-xl border border-sakura-200 bg-white shadow-sm transition-transform duration-500 [transform-style:preserve-3d] ${
                        isFlipped ? "[transform:rotateY(180deg)]" : ""
                      }`}
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-5 [backface-visibility:hidden]">
                        <p className="text-2xl font-bold tracking-wide text-slate-800">{card.vocabulary.word}</p>
                        <p className="mt-1 text-sm text-sakura-600">{formatReading(card.vocabulary.word, card.vocabulary.reading)}</p>
                        <span className="mt-3">
                          <StatusBadge status={currentStatus} />
                        </span>
                        <p className="mt-3 text-[11px] text-slate-500">Bấm để lật → xem nghĩa</p>
                      </div>
                      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-sakura-50 p-5 [backface-visibility:hidden] [transform:rotateY(180deg)] border border-sakura-200">
                        <p className="text-sm font-medium text-slate-800">{normalizeMeaningVi(card.vocabulary.meaning, card.vocabulary.word)}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {card.vocabulary.word} — {formatReading(card.vocabulary.word, card.vocabulary.reading)}
                        </p>
                        <p className="mt-2 text-[11px] text-sakura-600">Cấp: {card.vocabulary.level}</p>
                        <p className="mt-3 text-[11px] text-slate-500">Bấm để lật lại</p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-2 flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {/* SRS SM-2: Again / Hard / Good / Easy */}
                    {(
                      [
                        ["again", "Quên", 2, "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"],
                        ["hard", "Khó", 3, "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"],
                        ["good", "Được", 4, "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"],
                        ["easy", "Dễ", 5, "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"],
                      ] as const
                    ).map(([key, label, q, cls]) => (
                      <button
                        key={key}
                        title={key === "again" ? "Quên — ôn lại sau 10 phút" : key === "hard" ? "Nhớ nhưng khó" : key === "good" ? "Nhớ tốt" : "Quá dễ"}
                        onClick={() => handleReview(card.id, q)}
                        disabled={isPending}
                        className={`flex-1 rounded-full border px-2 py-1.5 text-xs font-bold transition ${cls} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isPending ? "…" : label}
                      </button>
                    ))}
                    <button
                      onClick={() => handleDelete(card.id)}
                      disabled={isPending}
                      className="rounded-full border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700 disabled:opacity-50 shadow-sm"
                    >
                      Xóa
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {(card.isDue ?? true) ? (
                      <span className="font-semibold text-sakura-600">Đến hạn ôn</span>
                    ) : (
                      <span>Đã ôn — quay lại sau</span>
                    )}
                    {typeof card.interval === "number" && card.interval > 0 ? ` • kỳ trước ${card.interval} ngày` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <Pagination currentPage={safePage} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
