import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dealhoan.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/hoan-tien-*",
          "/cach-san-*",
          "/docs",
          "/terms",
          "/privacy",
        ],
        disallow: [
          "/api/",
          "/admin/",
          "/auth/",
          "/go",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
