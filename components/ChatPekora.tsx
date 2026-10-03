"use client";

import { useState, useRef, useEffect } from "react";
import { VIDEO_SUGGESTIONS } from "@/lib/pekora";

type ChatItem = {
  id?: number | string;
  role: string;
  content: string;
  created_at?: string;
};

type Props = {
  initialMessages: ChatItem[];
  /** Video đang xem — Pekora trả lời theo ngữ cảnh video này */
  videoContext?: { id: number; title: string; level: string } | null;
};

const QUICK_PROMPTS = [
  "Giải thích ngữ pháp ~てる",
  "Dịch câu này",
  "Kanji 今日 đọc sao peko?",
  "Luyện hội thoại N5 peko!",
];

const BRAND_GREETING =
  "Konpeko, konpeko, konpeko! Hololive san-kisei no Usada Pekora-peko! doumo, doumo! 🐰💕 Pekora đây! 「ようこそ！」(youkoso) chào mừng bạn đến với LMS Nihongo peko~ ✨ Hôm nay bạn muốn học gì nào peko? 🐰🎀 「一緒に頑張ろう！」(issho ni ganbarou)";

export default function ChatPekora({ initialMessages, videoContext }: Props) {
  const [messages, setMessages] = useState<ChatItem[]>(() =>
    initialMessages.length > 0
      ? initialMessages
      : [{ id: "pekora-greeting", role: "assistant", content: BRAND_GREETING }],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cho phép tắt ngữ cảnh video (hỏi tự do)
  const [askAboutVideo, setAskAboutVideo] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Keep initialMessages in sync if server revalidates (not strictly needed)
  useEffect(() => {
    setMessages(
      initialMessages.length > 0
        ? initialMessages
        : [{ id: "pekora-greeting", role: "assistant", content: BRAND_GREETING }],
    );
  }, [initialMessages]);

  const sendMessage = async (text?: string) => {
    const raw = (text ?? input).trim();
    if (!raw || loading) return;
    setError(null);
    setInput("");
    const userMsg: ChatItem = { role: "user", content: raw };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const res = await fetch("/api/chat/pekora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: raw,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          videoId: videoContext && askAboutVideo ? videoContext.id : undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = (data as { error?: string })?.error || `Lỗi ${res.status} peko 🐰`;
        throw new Error(msg);
      }

      const reply: string =
        (data as { reply?: string; content?: string })?.reply ??
        (data as { content?: string })?.content ??
        "Pekora hơi lag xíu peko... thử lại nhé! 🐰";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi kết nối peko 🐰";
      setError(msg);
      // rollback optimistic? keep user msg but show error
    } finally {
      setLoading(false);
      // focus back
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleQuick = (prompt: string) => {
    // For "Dịch câu này" keep as is; user can edit
    setInput(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col rounded-2xl border border-sakura-200 bg-white shadow-sm overflow-hidden">
      {/* Header avatar Pekora */}
      <div className="flex items-center gap-3 border-b border-sakura-100 bg-gradient-to-r from-sakura-50 via-white to-sakura-50 px-4 py-3 sm:px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sakura-500 text-xl shadow-sm ring-2 ring-sakura-200">
          🐰
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            Usada Pekora
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online peko
            </span>
          </p>
          <p className="text-xs text-slate-500 truncate">
            VTuber Hololive • Gia sư tiếng Nhật kawaii của bạn peko! 🌸 「一緒に頑張ろう！」
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-sakura-600 bg-sakura-50 border border-sakura-200 rounded-full px-2.5 py-1">
          <span>🌸</span> Sakura Mode
        </div>
      </div>

      {/* Video context chip — đang hỏi về video nào */}
      {videoContext && (
        <div className="flex items-center gap-2 border-b border-sakura-100 bg-sakura-50/70 px-3 py-2 sm:px-4">
          <span className="text-sm">🎬</span>
          <p className="min-w-0 flex-1 truncate text-xs text-slate-600">
            {askAboutVideo ? (
              <>Đang hỏi về video: <span className="font-bold text-slate-800">{videoContext.title}</span> <span className="rounded bg-white border border-sakura-200 px-1.5 py-0.5 text-[10px] font-bold text-sakura-700">{videoContext.level}</span></>
            ) : (
              <>Đã tắt ngữ cảnh video — đang hỏi tự do peko 🐰</>
            )}
          </p>
          <button
            type="button"
            onClick={() => setAskAboutVideo((v) => !v)}
            className="shrink-0 rounded-full border border-sakura-200 bg-white px-2.5 py-1 text-[11px] font-bold text-sakura-700 hover:bg-sakura-500 hover:text-white transition-colors"
          >
            {askAboutVideo ? "Tắt" : "Bật lại"}
          </button>
        </div>
      )}
      {/* Câu hỏi gợi ý về video */}
      {videoContext && askAboutVideo && (
        <div className="flex flex-wrap gap-1.5 border-b border-sakura-100 bg-white px-3 py-2 sm:px-4">
          {VIDEO_SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendMessage(q)}
              disabled={loading}
              className="rounded-full bg-sakura-500 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-1.5 border-b border-sakura-100 bg-sakura-50/50 px-3 py-2 sm:px-4">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handleQuick(p)}
            className="rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs font-medium text-sakura-700 hover:bg-sakura-500 hover:text-white hover:border-sakura-500 transition-colors shadow-sm"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Messages list */}
      <div
        ref={listRef}
        className="flex-1 min-h-[380px] max-h-[56vh] sm:max-h-[62vh] overflow-y-auto bg-[#fff7f9] px-3 py-4 sm:px-4 scrollbar-thin"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at top, #ffe4ec 0%, transparent 60%), radial-gradient(ellipse at bottom, #ffc8d6 0%, transparent 50%)",
        }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white border border-sakura-200 shadow-sm text-3xl">
              🐰
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Konpeko, konpeko, konpeko! Hololive san-kisei no Usada Pekora-peko! doumo, doumo! 🐰</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                Pekora ở đây để giúp bạn học tiếng Nhật! Hãy thử bấm quick prompt bên trên hoặc gõ câu hỏi nhé peko~{" "}
                <span className="text-sakura-600">「何でも聞いてね peko!」</span>
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {QUICK_PROMPTS.slice(0, 2).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleQuick(p)}
                  className="rounded-full bg-sakura-500 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-sakura-600"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={`${m.role}-${idx}-${m.id ?? idx}`}
                  className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-sakura-200 text-sm shadow-sm">
                      🐰
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words ${
                      isUser
                        ? "bg-sakura-500 text-white rounded-br-md"
                        : "bg-white border border-sakura-200 text-slate-800 rounded-bl-md"
                    }`}
                  >
                    {m.content}
                  </div>
                  {isUser && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white text-[11px] font-bold">
                      You
                    </div>
                  )}
                </div>
              );
            })}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-sakura-200 text-sm shadow-sm">
                  🐰
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-sakura-200 bg-white px-4 py-3 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sakura-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sakura-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sakura-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 sm:mx-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-sakura-100 bg-white p-3 sm:p-4">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhắn gì đó cho Pekora peko... 🐰"
          className="flex-1 rounded-full border border-sakura-200 bg-sakura-50/60 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-200"
          maxLength={2000}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-sakura-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Gửi"
          )}
        </button>
      </form>

      <p className="border-t border-sakura-100 bg-sakura-50/40 px-4 py-2 text-center text-[11px] text-slate-400">
        Pekora trả lời bằng AI Gemini • Nếu chưa có <code className="rounded bg-white px-1 py-0.5 border border-sakura-200">GEMINI_API_KEY</code> sẽ dùng mock kawaii peko 🐰
      </p>
    </div>
  );
}
