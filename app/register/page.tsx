"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LEVEL_OPTIONS: Array<"N5" | "N4" | "N3" | "N2" | "N1"> = ["N5", "N4", "N3", "N2", "N1"];

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [targetLevel, setTargetLevel] = useState<"N5" | "N4" | "N3" | "N2" | "N1">("N4");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, target_level: targetLevel }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Đăng ký thất bại";
        setError(msg);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-sakura-200 rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Đăng ký</h1>
          <p className="mt-1 text-sm text-slate-500">Tạo tài khoản LMS Nihongo 🌸</p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Tên hiển thị
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên của bạn"
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sakura-400 focus:ring-2 focus:ring-sakura-400/20"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sakura-400 focus:ring-2 focus:ring-sakura-400/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sakura-400 focus:ring-2 focus:ring-sakura-400/20"
            />
          </div>

          <div>
            <label htmlFor="target_level" className="block text-sm font-medium text-slate-700 mb-1">
              Trình độ mục tiêu
            </label>
            <select
              id="target_level"
              value={targetLevel}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "N5" || v === "N4" || v === "N3" || v === "N2" || v === "N1") setTargetLevel(v);
              }}
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-sakura-400 focus:ring-2 focus:ring-sakura-400/20"
            >
              {LEVEL_OPTIONS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sakura-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-semibold text-sakura-600 hover:text-sakura-700">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
