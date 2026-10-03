import "./globals.css";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import ChatPekoraModal from "@/components/ChatPekoraModal";
import Navbar from "@/components/Navbar";
// Admin nav (isAdmin): /admin/videos, /admin/insert, /admin/subtitle, /admin/users, /admin/vocab, /admin/grammar

export const metadata: Metadata = {
  title: "LMS Nihongo — Học tiếng Nhật qua Video",
  description: "Nền tảng học tiếng Nhật qua video YouTube với phụ đề đồng bộ, NLP kuromoji và flashcard."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  type NavUser = { id: string; email: string; name: string; role?: string; target_level?: string };
  let user: NavUser | null = null;
  try {
    // getCurrentUser handles both server cookies() and NextRequest — no arg in layout
    const maybe = await getCurrentUser();
    if (maybe && typeof maybe === "object" && "email" in maybe) {
      const m = maybe as unknown as NavUser;
      user = { id: m.id, email: m.email, name: m.name, role: m.role, target_level: m.target_level };
    }
  } catch {
    user = null;
  }
  const isAdmin = user?.role === "ADMIN";
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <Navbar user={user} isAdmin={isAdmin} />
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        <ChatPekoraModal />
      </body>
    </html>
  );
}
