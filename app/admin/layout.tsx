"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { countPendingReports } from "@/app/actions/vocabReports";

const ADMIN_LINKS = [
  { href: "/admin/videos", label: "Quản lý Video", desc: "Danh sách, sửa, xóa", icon: "🎬" },
  { href: "/admin/insert", label: "+ Video", desc: "Thêm video YouTube", icon: "➕" },
  { href: "/admin/subtitle", label: "+ Phụ đề", desc: "Chèn / sửa phụ đề", icon: "💬" },
  { href: "/admin/questions", label: "Câu hỏi", desc: "Xem, sửa, xóa đề", icon: "❓" },
  { href: "/admin/users", label: "Users", desc: "Role, level, xóa", icon: "👥" },
  { href: "/admin/vocab", label: "Vocab", desc: "Từ vựng", icon: "📚" },
  { href: "/admin/grammar", label: "Grammar", desc: "Ngữ pháp", icon: "📝" },
  { href: "/admin/reports", label: "Báo lỗi", desc: "User báo từ sai", icon: "⚠️", badge: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    countPendingReports()
      .then((n) => setPendingCount(Number(n) || 0))
      .catch(() => {});
  }, [pathname]);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[240px_1fr] lg:items-start">
      {/* Mobile toggle */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex w-full items-center justify-between rounded-xl border border-sakura-200 bg-white px-4 py-2.5 text-sm font-bold text-sakura-700 shadow-sm hover:bg-sakura-50"
        >
          <span>☰ Menu quản trị</span>
          <span aria-hidden>{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          open ? "block" : "hidden"
        } lg:sticky lg:top-20 lg:block rounded-2xl border border-sakura-200 bg-white p-3 shadow-sm`}
      >
        <p className="px-2 py-1 text-[11px] font-extrabold tracking-widest text-sakura-400 uppercase">
          Quản trị
        </p>
        <nav className="mt-1 flex flex-col gap-1">
          {ADMIN_LINKS.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-xl bg-sakura-500 px-3 py-2.5 text-sm font-bold text-white shadow-sm"
                    : "rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-sakura-50 hover:text-sakura-700"
                }
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{l.icon}</span>
                  <span>{l.label}</span>
                  {"badge" in l && l.badge && pendingCount > 0 && (
                    <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-extrabold text-white">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 block pl-7 text-[11px] font-normal ${
                    active ? "text-white/80" : "text-slate-400"
                  }`}
                >
                  {l.desc}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="my-2 border-t border-sakura-100" />
        <Link
          href="/"
          className="block rounded-xl px-3 py-2.5 text-center text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        >
          ← Dashboard
        </Link>
      </aside>

      {/* Content */}
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
