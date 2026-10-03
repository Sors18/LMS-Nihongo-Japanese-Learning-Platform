"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Pagination from "@/components/Pagination";
import {
  createUser,
  deleteUser,
  updateUserLevel,
  updateUserName,
  updateUserRole,
} from "@/app/actions/manageUser";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  target_level: string;
  created_at: string | Date;
};

function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export default function UsersClient({
  users: initialUsers,
  currentPage = 1,
  totalPages = 1,
  totalCount = 0,
  query: initialQuery = "",
}: {
  users: UserRow[];
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  query?: string;
}) {
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  const urlQuery = searchParams.get("q") ?? initialQuery ?? "";

  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [edits, setEdits] = useState<Record<string, { name: string; role: string; level: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "USER", target_level: "N4" });

  // Search state — sync with URL ?q=, debounce push to /admin/users, keep ?page handling via Pagination
  const [searchValue, setSearchValue] = useState(urlQuery);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== searchValue) {
      setSearchValue(q);
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
      const trimmed = searchValue.trim();
      if (!trimmed) params.delete("q");
      else params.set("q", trimmed);
      // reset to page 1 when search changes
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `/admin/users?${qs}` : "/admin/users", { scroll: false });
    }, 400);
    return () => {
      clearTimeout(debounceRef.current as unknown as number);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  function clearSearch() {
    setSearchValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/admin/users?${qs}` : "/admin/users", { scroll: false });
  }

  const getEdit = (u: UserRow) => {
    const e = edits[u.id];
    if (e) return e;
    return { name: u.name, role: u.role, level: u.target_level };
  };

  const setEditField = (userId: string, field: "name" | "role" | "level", value: string) => {
    setEdits((prev) => {
      const cur = prev[userId] ?? (() => {
        const orig = users.find((x) => x.id === userId);
        return { name: orig?.name ?? "", role: orig?.role ?? "USER", level: orig?.target_level ?? "N5" };
      })();
      return { ...prev, [userId]: { ...cur, [field]: value } };
    });
  };

  const handleSave = (userId: string) => {
    const orig = users.find((u) => u.id === userId);
    if (!orig) return;
    const edit = getEdit(orig);
    const nameChanged = edit.name.trim() !== orig.name;
    const roleChanged = edit.role !== orig.role;
    const levelChanged = edit.level !== orig.target_level;

    if (!nameChanged && !roleChanged && !levelChanged) {
      setError("Không có thay đổi để lưu");
      return;
    }
    if (nameChanged && !edit.name.trim()) {
      setError("Tên không được để trống");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      let err: string | null = null;
      let updatedName = orig.name;
      let updatedRole = orig.role;
      let updatedLevel = orig.target_level;

      if (nameChanged) {
        const res = await updateUserName(userId, edit.name.trim());
        if (!res.ok) err = res.error as string;
        else {
          const u = res.user as UserRow | undefined;
          if (u && typeof u.name === "string") updatedName = u.name;
          else updatedName = edit.name.trim();
        }
      }

      if (!err && roleChanged) {
        const res = await updateUserRole(userId, edit.role);
        if (!res.ok) err = res.error as string;
        else {
          const u = res.user as UserRow | undefined;
          if (u && typeof u.role === "string") updatedRole = u.role;
          else updatedRole = edit.role;
        }
      }

      if (!err && levelChanged) {
        const res = await updateUserLevel(userId, edit.level);
        if (!res.ok) err = res.error as string;
        else {
          const u = res.user as UserRow | undefined;
          if (u && typeof u.target_level === "string") updatedLevel = u.target_level;
          else if (u && typeof (u as unknown as { target_level?: string }).target_level === "string") updatedLevel = (u as unknown as { target_level: string }).target_level;
          else updatedLevel = edit.level;
        }
      }

      if (err) {
        setError(err);
      } else {
        setSuccess(`Đã cập nhật user ${orig.email}`);
        setUsers((prev) =>
          prev.map((x) =>
            x.id === userId ? { ...x, name: updatedName, role: updatedRole, target_level: updatedLevel } : x
          )
        );
        setEdits((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    });
  };

  const handleDelete = (userId: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteUser(userId);
      if (!res.ok) setError((res.error as string) || "Xóa thất bại");
      else {
        setSuccess(`Đã xóa user ${userId.slice(0, 8)}`);
        setUsers((prev) => prev.filter((x) => x.id !== userId));
        setDeleteConfirm(null);
        setEdits((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const emailTrim = newUser.email.trim();
    const password = newUser.password;
    const nameTrim = newUser.name.trim();
    if (!emailTrim || !password || !nameTrim) {
      setError("Vui lòng điền đủ email, mật khẩu và tên");
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(emailTrim)) {
      setError("Email không hợp lệ");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải ít nhất 6 ký tự");
      return;
    }
    startTransition(async () => {
      const res = await createUser({
        email: emailTrim,
        password,
        name: nameTrim,
        role: newUser.role,
        target_level: newUser.target_level,
      });
      if (!res.ok) {
        setError((res.error as string) || "Tạo user thất bại");
      } else {
        const created = res.user as UserRow | undefined;
        if (created) {
          setUsers((prev) => [created as UserRow, ...prev]);
        } else {
          // Fallback optimistic if API didn't return user
          setUsers((prev) => [
            {
              id: `tmp-${Date.now()}`,
              email: emailTrim.toLowerCase(),
              name: nameTrim,
              role: newUser.role,
              target_level: newUser.target_level,
              created_at: new Date().toISOString(),
            } as UserRow,
            ...prev,
          ]);
        }
        setSuccess(`Đã tạo user ${emailTrim.toLowerCase()}`);
        setNewUser({ email: "", password: "", name: "", role: "USER", target_level: "N4" });
      }
    });
  };


  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">{success}</p>}

      {/* Form thêm user - sakura UI */}
      <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Thêm user mới</h3>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-6 items-end">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              placeholder="email@example.com"
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Mật khẩu</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              placeholder="≥ 6 ký tự"
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Tên</label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
              placeholder="Tên hiển thị"
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Level</label>
            <select
              value={newUser.target_level}
              onChange={(e) => setNewUser((p) => ({ ...p, target_level: e.target.value }))}
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
            >
              <option value="N5">N5</option>
              <option value="N4">N4</option>
              <option value="N3">N3</option>
              <option value="N2">N2</option>
              <option value="N1">N1</option>
            </select>
          </div>
          <div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-full bg-sakura-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sakura-600 disabled:opacity-50 shadow-sm"
            >
              {isPending ? "Đang thêm..." : "Thêm"}
            </button>
          </div>
        </form>
      </div>

      {/* Search — giữ filter q, sync với URL ?q=, reset page */}
      <div className="rounded-xl border border-sakura-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Tìm theo email hoặc tên..."
              aria-label="Tìm kiếm user"
              className="w-full rounded-full border border-sakura-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-sakura-300 focus:outline-none focus:ring-2 focus:ring-sakura-200"
            />
            {searchValue && (
              <button
                onClick={clearSearch}
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
          <p className="text-xs text-slate-500 whitespace-nowrap">
            {totalCount} user{urlQuery ? ` · lọc "${urlQuery}"` : ""} · Trang {currentPage}/{totalPages} · Hiển thị {users.length}
          </p>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-400">{urlQuery ? `Không tìm thấy user nào cho "${urlQuery}".` : "Chưa có user nào."}</p>
          <div className="mt-4 flex justify-center gap-2">
            {urlQuery ? (
              <button onClick={clearSearch} className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-sakura-50">Xóa lọc</button>
            ) : null}
            <a href="/admin/videos" className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-sakura-50">Quản lý Video</a>
            <a href="/" className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-sakura-50">Dashboard</a>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sakura-200 bg-white">
          <table className="w-full text-left text-sm">
          <thead className="bg-sakura-50 text-xs text-sakura-700">
            <tr>
              <th className="px-3 py-2">Email / Tên</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Ngày tạo</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sakura-100 bg-white">
            {users.map((u) => {
              const edit = getEdit(u);
              const isDirty = edit.name.trim() !== u.name || edit.role !== u.role || edit.level !== u.target_level;
              return (
                <tr key={u.id} className="hover:bg-sakura-50/50">
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800 text-sm">{u.email}</p>
                    <input
                      value={edit.name}
                      onChange={(e) => setEditField(u.id, "name", e.target.value)}
                      className="mt-1 w-full max-w-[220px] rounded-lg border border-sakura-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
                      placeholder="Tên hiển thị"
                    />
                    <p className="mt-1 font-mono text-[11px] text-slate-400 truncate max-w-[220px]" title={u.id}>ID: {u.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        u.role === "ADMIN"
                          ? "rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm"
                          : "rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700"
                      }
                    >
                      {u.role}
                    </span>
                    <div className="mt-2">
                      <select
                        value={edit.role}
                        onChange={(e) => setEditField(u.id, "role", e.target.value)}
                        className="rounded-lg border border-sakura-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-sakura-300 focus:outline-none"
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700">{u.target_level}</span>
                    <div className="mt-2">
                      <select
                        value={edit.level}
                        onChange={(e) => setEditField(u.id, "level", e.target.value)}
                        className="rounded-lg border border-sakura-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-sakura-300 focus:outline-none"
                      >
                        <option value="N5">N5</option>
                        <option value="N4">N4</option>
                        <option value="N3">N3</option>
                        <option value="N2">N2</option>
                        <option value="N1">N1</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1.5 items-center">
                      <button
                        onClick={() => handleSave(u.id)}
                        disabled={isPending || !isDirty}
                        className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
                      >
                        {isPending ? "Đang lưu..." : "Lưu"}
                      </button>
                      {deleteConfirm === u.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={isPending}
                            className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
                          >
                            Xác nhận?
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-sakura-50"
                          >
                            Hủy
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="rounded-full border-2 border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} />

      <p className="text-xs text-slate-400">Tổng {totalCount} user{urlQuery ? ` · lọc "${urlQuery}"` : ""} · Trang {currentPage}/{totalPages}. Chỉ ADMIN mới truy cập được trang này (middleware đã chặn). Thao tác sẽ gọi Server Actions và revalidatePath /admin/users.</p>
    </div>
  );
}
