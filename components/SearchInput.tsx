"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export default function SearchInput() {
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQ);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const firstRender = useRef(true);

  // Sync when URL changes externally (back/forward or filter change)
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    // avoid loop: only sync if different and not currently debouncing user typing
    if (q !== value) {
      // if user is typing, the debounced push will handle; but for external nav we sync
      setValue(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    clearTimeout(debounceRef.current as unknown as number);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (!trimmed) params.delete("q");
      else params.set("q", trimmed);
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/", { scroll: false });
    }, 400);
    return () => {
      clearTimeout(debounceRef.current as unknown as number);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function clear() {
    setValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="relative w-full max-w-md">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tìm theo tiêu đề hoặc YouTube ID..."
        aria-label="Tìm kiếm video"
        className="w-full rounded-full border border-sakura-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-sakura-300 focus:outline-none focus:ring-2 focus:ring-sakura-200"
      />
      {value && (
        <button
          onClick={clear}
          aria-label="Xóa tìm kiếm"
          className="absolute inset-y-0 right-2 flex items-center rounded-full px-2 text-slate-400 hover:text-slate-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
