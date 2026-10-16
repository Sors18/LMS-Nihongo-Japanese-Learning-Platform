"use client";

import { useState, useEffect, useRef } from "react";

type NavbarUser = {
  id: string;
  email: string;
  name: string;
  role?: string;
  target_level?: string;
} | null;

type NavbarProps = {
  user: NavbarUser;
  isAdmin: boolean;
};

export default function Navbar({ user, isAdmin }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const dropdown = dropdownRef.current;
      const button = buttonRef.current;
      if (
        dropdown &&
        !dropdown.contains(target) &&
        button &&
        !button.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-sakura-200 shadow-sm relative">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <a
          href="/"
          className="flex items-center gap-2 font-bold text-lg tracking-tight text-slate-800 shrink-0"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="LMS Nihongo logo" width={32} height={32} className="h-8 w-8 rounded-full shadow-sm" />
          <span>
            LMS Nihongo{" "}
            <span className="font-light text-sakura-400">Sakura</span>
          </span>
        </a>

        {/* Desktop nav - hidden until lg */}
        <nav className="hidden lg:flex flex-wrap gap-1.5 sm:gap-2 text-sm text-slate-600 items-center justify-end">
          <a
            href="/"
            className="hover:text-sakura-600 px-2 py-1 rounded-full hover:bg-sakura-50"
          >
            Dashboard
          </a>
          <a
            href="/roadmap"
            className="hover:text-sakura-600 px-2 py-1 rounded-full hover:bg-sakura-50"
          >
            🗺️ Roadmap
          </a>
          <a
            href="/streak"
            className="hover:text-sakura-600 px-2 py-1 rounded-full hover:bg-sakura-50"
          >
            🔥 Streak
          </a>
          <a
            href="/kanji"
            className="hover:text-sakura-600 px-2 py-1 rounded-full hover:bg-sakura-50"
          >
            ✏️ Kanji
          </a>
          <a
            href="/chat"
            className="hover:text-sakura-600 px-2 py-1 rounded-full hover:bg-sakura-50"
          >
            🐰 Chat
          </a>
          {isAdmin && (
            <a
              href="/admin/videos"
              className="rounded-full bg-white border border-sakura-200 px-3 py-1.5 text-xs font-bold text-sakura-700 hover:bg-sakura-50"
            >
              Quản lý
            </a>
          )}
          <a
            href="/flashcards"
            className="hover:text-sakura-600 px-2 py-1"
          >
            Flashcard
          </a>
          <a href="/history" className="hover:text-sakura-600 px-2 py-1">
            Lịch sử
          </a>
          {user ? (
            <div className="flex items-center gap-2">
              <span
                className="hidden md:inline text-sm font-medium text-slate-700 max-w-[12ch] truncate"
                title={user.email}
              >
                {user.name}
              </span>
              <span
                className={
                  user.role === "ADMIN"
                    ? "rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white shadow-sm"
                    : "rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-sakura-700"
                }
              >
                {user.role ?? "USER"}
              </span>
              <form
                action="/api/auth/logout"
                method="post"
                className="inline"
              >
                <button
                  type="submit"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                >
                  Đăng xuất
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <a
                href="/login"
                className="rounded-full bg-white border border-sakura-200 px-3 py-1.5 text-xs font-bold text-sakura-700 hover:bg-sakura-50"
              >
                Đăng nhập
              </a>
              <a
                href="/register"
                className="rounded-full bg-sakura-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sakura-600 shadow-sm"
              >
                Đăng ký
              </a>
            </div>
          )}
        </nav>

        {/* Hamburger button - visible below lg */}
        <button
          ref={buttonRef}
          type="button"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          aria-expanded={open}
          aria-controls="navbar-dropdown"
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden inline-flex items-center justify-center rounded-xl border border-sakura-200 bg-white p-2.5 text-slate-600 hover:bg-sakura-50 hover:text-sakura-700 shadow-sm transition"
        >
          {open ? (
            // X icon when open
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            // 3 gạch hamburger
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Dropdown - absolute position, only below lg */}
      {open && (
        <div
          ref={dropdownRef}
          id="navbar-dropdown"
          className="absolute top-full right-4 w-64 rounded-2xl border border-sakura-200 bg-white shadow-xl p-3 lg:hidden z-50 max-h-[calc(100vh-4rem)] overflow-y-auto"
        >
          <nav className="flex flex-col gap-1 text-sm">
            <a
              href="/"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700 font-medium"
            >
              Dashboard
            </a>
            <a
              href="/roadmap"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700"
            >
              🗺️ Roadmap
            </a>
            <a
              href="/streak"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700"
            >
              🔥 Streak
            </a>
            <a
              href="/kanji"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700"
            >
              ✏️ Kanji
            </a>
            <a
              href="/chat"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700"
            >
              🐰 Chat
            </a>
            <a
              href="/flashcards"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700"
            >
              Flashcard
            </a>
            <a
              href="/history"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 hover:bg-sakura-50 hover:text-sakura-700 text-slate-700"
            >
              Lịch sử
            </a>

            {isAdmin && (
              <>
                <div className="my-2 border-t border-sakura-100" />
                <p className="px-3 py-1 text-[11px] font-extrabold tracking-widest text-sakura-400 uppercase">
                  Quản trị
                </p>
                <a
                  href="/admin/videos"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 border border-sakura-200 bg-white text-sakura-700 font-bold hover:bg-sakura-50 text-center"
                >
                  Quản lý
                </a>
              </>
            )}

            <div className="my-2 border-t border-sakura-100" />

            {user ? (
              <div className="flex flex-col gap-2">
                <div className="px-3 py-2 rounded-xl bg-sakura-50 border border-sakura-100">
                  <p
                    className="text-sm font-semibold text-slate-800 truncate"
                    title={user.email}
                  >
                    {user.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate" title={user.email}>
                    {user.email}
                  </p>
                  <span
                    className={
                      user.role === "ADMIN"
                        ? "mt-1.5 inline-block rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white shadow-sm"
                        : "mt-1.5 inline-block rounded-full bg-white border border-sakura-200 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-sakura-700"
                    }
                  >
                    {user.role ?? "USER"}
                  </span>
                </div>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800 text-center"
                  >
                    Đăng xuất
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <a
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-sakura-200 bg-white px-3 py-2.5 text-sm font-bold text-sakura-700 hover:bg-sakura-50 text-center"
                >
                  Đăng nhập
                </a>
                <a
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-sakura-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-sakura-600 text-center shadow-sm"
                >
                  Đăng ký
                </a>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
