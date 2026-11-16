import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  typedRoutes: true,
  // Self-hosted images only (public/img/<slug>/): no remotePatterns, no hotlinks.
  images: { formats: ["image/avif", "image/webp"], qualities: [60, 75] },
};

export default nextConfig;
