import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatPekora from "@/components/ChatPekora";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ videoId?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const rawHistory = await prisma.chatMessage.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: "asc" },
    take: 100,
  });

  const initialMessages = rawHistory.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    created_at: m.created_at.toISOString(),
  }));

  const BRAND_GREETING =
    "Konpeko, konpeko, konpeko! Usada Pekora-peko! Pekora đây! 🐰💕「ようこそ！」(youkoso) Chào mừng bạn đến với LMS Nihongo peko~ ✨ Hôm nay bạn muốn học gì nào peko? 🐰🎀 「一緒に頑張ろう！」(issho ni ganbarou)";

  const displayMessages =
    initialMessages.length > 0
      ? initialMessages
      : [
          {
            id: "pekora-greeting",
            role: "assistant",
            content: BRAND_GREETING,
            created_at: new Date().toISOString(),
          },
        ];

  // Ngữ cảnh video đang xem (?videoId=) — best effort, sai id thì bỏ qua
  let videoContext: { id: number; title: string; level: string } | null = null;
  try {
    const sp = searchParams ? await searchParams : undefined;
    const rawVid = typeof sp?.videoId === "string" ? sp.videoId : Array.isArray(sp?.videoId) ? sp.videoId[0] : undefined;
    const vid = rawVid ? Number(rawVid) : NaN;
    if (Number.isInteger(vid) && vid > 0) {
      const video = await prisma.video.findUnique({ where: { id: vid }, select: { id: true, title: true, level: true } });
      if (video) videoContext = { id: video.id, title: video.title, level: String(video.level) };
    }
  } catch {
    videoContext = null;
  }

  return (
    <div className="space-y-6">
      {/* Header sakura */}
      <div className="rounded-2xl border border-sakura-200 bg-gradient-to-br from-white via-sakura-50 to-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-slate-800">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sakura-500 text-white shadow-sm">🐰</span>
              Chat với Pekora
              <span className="rounded-full bg-sakura-500 px-2.5 py-0.5 text-xs font-bold text-white">AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-sakura-200 bg-white px-3 py-1.5 font-medium text-sakura-700 shadow-sm">
              {user.name} • {user.target_level}
            </span>
            <span className="hidden sm:inline rounded-full bg-sakura-100 border border-sakura-200 px-3 py-1 text-sakura-700">
              {initialMessages.length} tin nhắn
            </span>
          </div>
        </div>
      </div>

      <ChatPekora initialMessages={displayMessages} videoContext={videoContext} />
    </div>
  );
}
