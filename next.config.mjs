/** @type {import('next').NextConfig} */
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  experimental: {
    // Chống CSRF Server Actions: chỉ domain mình mới được gọi.
    // KHÔNG để ["*"] ở production. Thêm domain prod qua env ALLOWED_ORIGINS.
    serverActions: { allowedOrigins: ["localhost:3000", "127.0.0.1:3000", ...extraOrigins] }
  },
  // Ẩn nút devtools "N" góc trái dưới khi chạy npm run dev
  devIndicators: false,
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Web không nhúng chính nó trong iframe (YouTube embed không bị ảnh hưởng —
      // header này chỉ áp dụng cho page của mình, không phải của youtube.com)
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      // Mic chỉ cho chính site (shadowing ghi âm), chặn camera
      { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      base.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers: base }];
  },
};
export default nextConfig;
