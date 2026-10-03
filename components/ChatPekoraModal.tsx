"use client";

import { useState, useRef, useEffect } from "react";
import { PEKORA_OPEN_EVENT, VIDEO_SUGGESTIONS, type PekoraVideoCtx } from "@/lib/pekora";

type ChatItem = {
  id?: number | string;
  role: string;
  content: string;
};

const QUICK_PROMPTS = [
  "Giải thích ngữ pháp ~てる",
  "Dịch câu này",
  "Kanji 今日 đọc sao peko?",
];

const BRAND_GREETING =
  "Konpeko, konpeko, konpeko! Usada Pekora-peko! Pekora đây! 🐰🌸";

export default function ChatPekoraModal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  /** Ngữ cảnh video đang xem — mở popup từ trang video sẽ set cái này */
  const [videoCtx, setVideoCtx] = useState<PekoraVideoCtx | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Lắng nghe sự kiện mở popup kèm ngữ cảnh video (từ trang /video/[id]):
  // mở PHIÊN MỚI (không hiện chat cũ), chào theo video
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<PekoraVideoCtx> | undefined;
      if (!detail || !Number.isInteger(detail.id) || (detail.id as number) <= 0) return;
      const title = String(detail.title ?? "Video đang xem");
      setVideoCtx({ id: detail.id as number, title, level: detail.level });
      setMessages([
        {
          role: "assistant",
          content: `Konpeko! 🐰 Pekora thấy bạn đang xem 「${title}」peko~ ✨ Hỏi Pekora về từ vựng, ngữ pháp hay nội dung video này nhé! Bấm 1 trong các gợi ý bên dưới nè peko~ 🎀`,
        },
      ]);
      setHasLoaded(true);
      setOpen(true);
    };
    window.addEventListener(PEKORA_OPEN_EVENT, handler);
    return () => window.removeEventListener(PEKORA_OPEN_EVENT, handler);
  }, []);

  const loadHistory = async () => {
    if (hasLoaded) return;
    let nextMessages: ChatItem[] | null = null;
    try {
      const res = await fetch("/api/chat/pekora/history", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          nextMessages = data.messages;
        } else if (Array.isArray(data.history)) {
          nextMessages = data.history;
        }
      }
    } catch {}
    if (nextMessages && nextMessages.length > 0) {
      setMessages(nextMessages);
    } else if (nextMessages && nextMessages.length === 0) {
      // Empty history -> show brand greeting once, not duplicate when has history
      setMessages([{ role: "assistant", content: BRAND_GREETING }]);
    } else {
      // fetch failed or no array -> also show brand greeting if still empty
      setMessages((prev) => (prev.length === 0 ? [{ role: "assistant", content: BRAND_GREETING }] : prev));
    }
    setHasLoaded(true);
  };

  useEffect(() => {
    if (open) loadHistory();
  }, [open]);

  // Fallback: ensure greeting appears when history loaded but messages still empty (e.g. cleared)
  // and guarantee it only shows once, never when history exists
  useEffect(() => {
    if (hasLoaded && messages.length === 0) {
      setMessages([{ role: "assistant", content: BRAND_GREETING }]);
    }
  }, [hasLoaded, messages.length]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg: ChatItem = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat/pekora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: [...messages, userMsg].slice(-10),
          videoId: videoCtx?.id,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = "/login?next=/chat";
        return;
      }
      const reply = data.reply || data.content || "Pekora chưa hiểu lắm peko… thử lại nhé 🐰";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Pekora bị lag xíu peko... thử lại nhé 🐰" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Đóng chat Pekora" : "Mở chat Pekora"}
        className="fixed bottom-4 right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-sakura-500 text-white shadow-lg hover:bg-sakura-600 transition hover:scale-105 active:scale-95"
      >
        {open ? (
          <span className="text-xl">✕</span>
        ) : (
          <span className="text-2xl">🐰</span>
        )}
      </button>

      {/* Modal window */}
      {open && (
        <div className="fixed bottom-20 right-4 z-[90] flex h-[480px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-sakura-200 bg-white shadow-2xl sm:h-[520px]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-sakura-100 bg-gradient-to-r from-white to-sakura-50 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sakura-500 text-white shadow-sm">🐰</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">Chat với Pekora</p>
              <p className="text-[11px] text-sakura-600">AI kawaii • peko peko!</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-slate-400 hover:bg-sakura-50 hover:text-slate-600"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-[#fff7f9] p-3 scrollbar-thin space-y-3">
            {messages.length === 0 ? (
              hasLoaded ? (
                <>
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-sakura-200 bg-white px-3 py-2 text-sm leading-relaxed shadow-sm text-slate-800">
                      <p className="whitespace-pre-wrap break-words">{BRAND_GREETING}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        className="rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs font-medium text-sakura-700 hover:bg-sakura-50"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-500 rounded-bl-sm">
                    <span className="animate-pulse">Đang tải peko...</span>
                  </div>
                </div>
              )
            ) : (
              messages.map((m, idx) => (
                <div key={`${m.role}-${idx}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-sakura-500 text-white rounded-br-sm"
                        : "bg-white border border-sakura-200 text-slate-800 rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-500 rounded-bl-sm">
                  <span className="animate-pulse">Pekora đang gõ peko...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Hàng gợi ý dưới đáy: hỏi về video (nếu có ngữ cảnh) hoặc quick prompt chung */}
          {(messages.length > 0 || videoCtx) && (
            <div className="border-t border-sakura-100 bg-white px-3 py-2">
              {videoCtx && (
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-xs">🎬</span>
                  <p className="min-w-0 flex-1 truncate text-[11px] text-slate-600">
                    Hỏi về: <span className="font-bold text-slate-800">{videoCtx.title}</span>
                  </p>
                  <button
                    onClick={() => setVideoCtx(null)}
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-sakura-50 hover:text-slate-600"
                    aria-label="Bỏ ngữ cảnh video"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(videoCtx ? VIDEO_SUGGESTIONS : QUICK_PROMPTS).map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    disabled={loading}
                    className={
                      videoCtx
                        ? "shrink-0 rounded-full bg-sakura-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50"
                        : "shrink-0 rounded-full border border-sakura-200 bg-sakura-50 px-3 py-1 text-[11px] font-medium text-sakura-700 hover:bg-sakura-100"
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-sakura-200 bg-white p-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhắn cho Pekora peko..."
              className="flex-1 rounded-full border border-sakura-200 bg-sakura-50 px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sakura-300"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-sakura-500 text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Gửi"
            >
              ↑
            </button>
          </form>
        </div>
      )}
    </>
  );
}
