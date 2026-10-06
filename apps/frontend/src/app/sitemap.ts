import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/lib/legal";

const BASE = process.env.APP_URL ?? "https://www.captionseasy.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/login`, changeFrequency: "monthly", priority: 0.6 },
    ...LEGAL_PAGES.map((p) => ({ url: `${BASE}${p.href}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
