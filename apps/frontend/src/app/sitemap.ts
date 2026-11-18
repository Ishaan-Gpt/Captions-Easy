import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/lib/legal";
import { LANDINGS, SEO_LOOKS } from "@/lib/seo/content";
import { releaseFor } from "@/lib/seo/releases";

const BASE = (process.env.APP_URL ?? "https://www.captionseasy.com").replace(/\/$/, "");
/** Bump when the public pages' content changes, so search engines know to re-read them. */
const CONTENT_UPDATED = new Date("2026-11-18");

// pages worth finding in search: home, the search landing pages, the style gallery and the public policies (sign-in and the studio stay out)
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, lastModified: CONTENT_UPDATED, changeFrequency: "weekly", priority: 1 },
    ...LANDINGS.map((l) => ({ url: `${BASE}/${l.slug}`, lastModified: CONTENT_UPDATED, changeFrequency: "monthly" as const, priority: 0.9 })),
    { url: `${BASE}/styles`, lastModified: CONTENT_UPDATED, changeFrequency: "weekly", priority: 0.9 },
    // style pages join the sitemap only once released with their own write-up (lib/seo/releases.ts)
    ...SEO_LOOKS.flatMap((l) => {
      const r = releaseFor(l.slug);
      return r ? [{ url: `${BASE}/styles/${l.slug}`, lastModified: new Date(r.released), changeFrequency: "monthly" as const, priority: 0.7 }] : [];
    }),
    ...LEGAL_PAGES.map((p) => ({ url: `${BASE}${p.href}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
