import { prisma } from "@/lib/prisma";
import UsersClient from "./UsersClient";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý User — LMS Nihongo" };

const PAGE_SIZE = 10;

type SearchParams = { page?: string | string[]; q?: string | string[] };

export default async function AdminUsersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const sp = searchParams ? await searchParams : undefined;
  const rawQ = typeof sp?.q === "string" ? sp.q : Array.isArray(sp?.q) ? sp.q[0] : undefined;
  const q = rawQ?.trim() ? rawQ.trim() : undefined;

  const rawPage = typeof sp?.page === "string" ? sp.page : Array.isArray(sp?.page) ? sp.page[0] : undefined;
  let page = parseInt(rawPage ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    target_level: string;
    created_at: Date;
  }> = [];
  let total = 0;
  let totalPages = 1;
  let error: string | null = null;

  try {
    const where: Prisma.UserWhereInput = {};
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } as unknown as Prisma.StringFilter },
        { name: { contains: q, mode: "insensitive" } as unknown as Prisma.StringFilter },
      ];
    }

    total = await prisma.user.count({ where });
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    users = await prisma.user.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        target_level: true,
        created_at: true,
      },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Serialize Date to string for client
  const serialized = users.map((u) => ({
    ...u,
    created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quản lý User</h1>
        <p className="mt-1 text-sm text-slate-400">Xem danh sách, đổi role/level/tên, hoặc xóa user. Tổng {total} user{q ? ` · lọc "${q}"` : ""} · Trang {page}/{totalPages}. Chỉ ADMIN mới vào được (middleware đã chặn).</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
          <p className="mt-2 text-sm text-slate-600">Kiểm tra XAMPP → Start MySQL, DB lms_nihongo, chạy <code>npm run db:push</code></p>
        </div>
      ) : (
        <UsersClient
          users={serialized as unknown as Array<{ id: string; email: string; name: string; role: string; target_level: string; created_at: string }>}
          currentPage={page}
          totalPages={totalPages}
          totalCount={total}
          query={q ?? ""}
        />
      )}

    </div>
  );
}
