import Link from "next/link";
import { listVocabReports } from "@/app/actions/vocabReports";
import ReportsClient from "./ReportsClient";

const TABS = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "RESOLVED", label: "Đã sửa" },
  { value: "REJECTED", label: "Đã bỏ qua" },
  { value: "ALL", label: "Tất cả" },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = (status ?? "PENDING").toUpperCase();
  const res = await listVocabReports(active);

  if (!("reports" in res) || res.ok !== true) {
    const err = "error" in res ? res.error : "Không tải được";
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {String(err)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Báo lỗi từ vựng</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          User báo từ sai → sửa ngay tại đây, xong đánh dấu đã sửa.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/reports?status=${t.value}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              active === t.value
                ? "bg-sakura-500 text-white shadow-sm"
                : "border border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <ReportsClient key={active} initial={res.reports} />
    </div>
  );
}
