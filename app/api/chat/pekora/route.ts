import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  mockPekoraReply,
  ensurePekoTail,
  buildGeminiChatBody,
  buildVideoContextBlock,
  extractGeminiText,
  type ChatMsg,
  type VideoContext,
} from "@/lib/pekora";
import { checkRateLimit, rateKey, rateLimitedResponse, sweepRateBuckets, RATE_PRESETS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function geminiModel(): string {
  return (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite").trim() || "gemini-3.5-flash-lite";
}

/** Gọi Gemini generateContent cho chat — thiếu key/lỗi → null để fallback. */
async function callGemini(message: string, history: ChatMsg[], videoCtx?: VideoContext | null): Promise<string | null> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGeminiChatBody(message, history, videoCtx)),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[pekora] Gemini error", res.status, text.slice(0, 500));
      return null;
    }
    const data: unknown = await res.json();
    const content = extractGeminiText(data);
    if (!content) return null;
    return ensurePekoTail(content);
  } catch (e) {
    console.warn("[pekora] Gemini fetch failed", e);
    return null;
  }
}

async function callOpenAI(message: string, history: { role: string; content: string }[], videoCtx?: VideoContext | null): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { PEKORA_SYSTEM_PROMPT } = await import("@/lib/pekora");
  const ctxBlock = buildVideoContextBlock(videoCtx);
  const systemPrompt = ctxBlock ? `${PEKORA_SYSTEM_PROMPT}\n\n${ctxBlock}` : PEKORA_SYSTEM_PROMPT;

  try {
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((h) => ({
        role: h.role === "assistant" || h.role === "pekora" ? "assistant" : h.role === "system" ? "system" : "user",
        content: String(h.content).slice(0, 2000),
      })),
      { role: "user", content: message },
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.85,
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[pekora] OpenAI error", res.status, text.slice(0, 500));
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return ensurePekoTail(content);
  } catch (e) {
    console.warn("[pekora] OpenAI fetch failed", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  // auth trước, rate-limit theo user id (chống 1 user spam hết quota Gemini)
  // auth
  let user: { id: string } | null = null;
  try {
    user = await getCurrentUser(req as unknown as Request);
  } catch {
    user = null;
  }
  if (!user) {
    // fallback try generic Request path (cookies header)
    try {
      const viaHeader = await getCurrentUser(req as unknown as Request);
      if (viaHeader) user = viaHeader;
    } catch {}
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized - vui lòng đăng nhập peko! 🐰" }, { status: 401 });
  }
  const rl = checkRateLimit(
    rateKey(req as unknown as Request, "chat", user.id),
    RATE_PRESETS.chat.limit,
    RATE_PRESETS.chat.windowMs
  );
  sweepRateBuckets();
  if (!rl.allowed) return rateLimitedResponse(rl.resetMs);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, history, videoId } = body as { message?: unknown; history?: unknown; videoId?: unknown };
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Thiếu 'message' peko! 🐰" }, { status: 400 });
  }
  const cleanMessage = message.trim().slice(0, 4000);
  const cleanHistory: { role: string; content: string }[] = Array.isArray(history)
    ? (history as unknown[])
        .filter((h) => h && typeof h === "object" && "role" in (h as object) && "content" in (h as object))
        .map((h) => {
          const o = h as { role: unknown; content: unknown };
          return { role: String(o.role), content: String(o.content).slice(0, 3000) };
        })
        .slice(-20)
    : [];

  // Lưu tin nhắn user vào DB
  try {
    await prisma.chatMessage.create({
      data: {
        user_id: user.id,
        role: "user",
        content: cleanMessage,
      },
    });
  } catch (e) {
    console.error("[pekora] save user message failed", e);
    // continue anyway
  }

  // Ngữ cảnh video đang xem — client chỉ gửi id, server tự load từ DB (chống prompt-injection)
  let videoCtx: VideoContext | null = null;
  const vid = typeof videoId === "number" ? videoId : Number(videoId);
  if (Number.isInteger(vid) && vid > 0) {
    try {
      const video = await prisma.video.findUnique({
        where: { id: vid },
        include: { subtitles: { orderBy: { start_time_ms: "asc" }, take: 60 } },
      });
      if (video) {
        videoCtx = {
          id: video.id,
          title: video.title,
          level: String(video.level),
          subtitles: video.subtitles.map((s) => s.raw_text),
        };
      }
    } catch (e) {
      console.warn("[pekora] load video context failed", e);
    }
  }

  // Tạo reply: Gemini (chính) → OpenAI (dự phòng) → mock kawaii
  let reply: string | null = null;

  if (process.env.GEMINI_API_KEY) {
    reply = await callGemini(cleanMessage, cleanHistory, videoCtx);
  }
  if (!reply && process.env.OPENAI_API_KEY) {
    reply = await callOpenAI(cleanMessage, cleanHistory, videoCtx);
  }
  if (!reply) {
    reply = mockPekoraReply(cleanMessage, videoCtx?.title ?? null);
  }

  // Lưu reply assistant vào DB
  try {
    await prisma.chatMessage.create({
      data: {
        user_id: user.id,
        role: "assistant",
        content: reply,
      },
    });
  } catch (e) {
    console.error("[pekora] save assistant failed", e);
  }

  return NextResponse.json({
    reply,
    role: "assistant",
    content: reply,
  });
}

export async function GET() {
  const engine = process.env.GEMINI_API_KEY ? `gemini:${geminiModel()}` : process.env.OPENAI_API_KEY ? "openai" : "mock";
  return NextResponse.json({
    ok: true,
    engine,
    hint: "POST { message: string, history?: {role, content}[] } để chat với Pekora peko! 🐰",
  });
}
