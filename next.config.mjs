/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] }
  },
  // Ẩn nút devtools "N" góc trái dưới khi chạy npm run dev
  devIndicators: false,
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false }
};
export default nextConfig;
