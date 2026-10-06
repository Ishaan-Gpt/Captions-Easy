import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/lib/legal";

const BASE = process.env.APP_URL ?? "https://www.captionseasy.com";

// only pages worth finding in search: the homepage and the public policies (sign-in and the studio stay out)
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    ...LEGAL_PAGES.map((p) => ({ url: `${BASE}${p.href}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
