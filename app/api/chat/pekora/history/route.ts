import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ messages: [], hint: "Chưa đăng nhập" });
  }
  const msgs = await prisma.chatMessage.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: "asc" },
    take: 100,
  });
  return NextResponse.json({
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at.toISOString(),
    })),
  });
}
