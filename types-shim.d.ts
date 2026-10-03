// Shim tối thiểu — KHÔNG override type gốc của Next.js.
// (Trước đây file này declare module next/server, next/link... với stub thiếu
// cookies/redirect/Link khiến `tsc` báo lỗi giả. Đã xóa để dùng type thật từ `next`.)
declare module "server-only" {}
