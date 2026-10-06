import type { MetadataRoute } from "next";

const BASE = process.env.APP_URL ?? "https://www.captionseasy.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/projects/", "/settings", "/pair"] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
