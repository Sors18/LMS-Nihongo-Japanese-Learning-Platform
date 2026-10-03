import InsertForm from "./InsertForm";

export const metadata = { title: "Thêm Video — LMS Nihongo" };

export default function AdminInsertPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Thêm Video từ YouTube</h1>
        <p className="mt-1 text-sm text-slate-400">
          Dán link YouTube → nhập tiêu đề/level → dán transcript → tạo video → mở ngay để test (vocab/grammar/test).
        </p>
      </div>

      <InsertForm />

      <div className="rounded-xl border border-sakura-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800">Mẹo</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
          <li>
            YouTube thumbnail tự hiện tại <code>/</code> qua <code>img.youtube.com/vi/{"{youtube_id}"}/hqdefault.jpg</code>.
          </li>
          <li>
            Transcript mỗi dòng 1 câu sẽ được chia 3s/dòng (start 0,3000,6000…). Muốn chính xác hơn: dùng trang{" "}
            <a href="/admin/subtitle" className="text-violet-400 hover:underline">
              Chèn phụ đề (hỗ trợ SRT/VTT với timestamp gốc)
            </a>{" "}
            hoặc sửa trong Prisma Studio (<code>npx prisma studio</code>).
          </li>
          <li>
            Sau khi chèn, vào <a href="/" className="text-sky-400 hover:underline">Dashboard</a> để thấy video mới.
          </li>
          <li>
            Video không nhúng được (chủ sở hữu tắt embed) sẽ báo lỗi trong player — hãy chọn video khác (đa số video public đều embed được).
          </li>
        </ul>
      </div>
    </div>
  );
}
