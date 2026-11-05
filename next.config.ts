import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/cron/sync-deals": ["./node_modules/@sparticuz/chromium/bin/**/*", "./node_modules/playwright-core/**/*"],
  },
  images: {
    remotePatterns: [
      // Shopee affiliate offer images
      { protocol: "https", hostname: "down-vn.img.susercontent.com" },
      { protocol: "https", hostname: "cf.shopee.vn" },
      // Lazada product images — served from several *.slatic.net subdomains,
      // Lazada's own CDN subdomains, and alicdn.com for cross-border listings.
      { protocol: "https", hostname: "*.slatic.net" },
      { protocol: "https", hostname: "*.lazada.vn" },
      { protocol: "https", hostname: "*.alicdn.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
