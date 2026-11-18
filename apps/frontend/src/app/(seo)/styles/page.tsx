import type { Metadata } from "next";
import { SEO_LOOKS, SITE_URL, TOTAL_LOOKS, SECTION_COPY } from "@/lib/seo/content";
import { JsonLd, LookCard, SeoShell, StartCta } from "@/components/seo/SeoShell";
import { isReleased } from "@/lib/seo/releases";

export const metadata: Metadata = {
  title: `${TOTAL_LOOKS}+ Animated Caption Styles for Reels, Shorts & TikTok | CaptionsEasy`,
  description: `Browse ${TOTAL_LOOKS}+ animated caption styles, from jumping boxes and karaoke fills to chrome, glitch and 3D type. Every style is free, with no watermark.`,
  alternates: { canonical: "/styles" },
};

const ORDER = ["Popular", "Viral", "Premium motion", "Trending", "Clean", "Fun", "Luxury", "Cinematic", "Retro", "Tech", "Classic"];

export default function StylesHub() {
  const groups = ORDER.map((section) => ({ section, looks: SEO_LOOKS.filter((l) => l.section === section) })).filter((g) => g.looks.length);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "CaptionsEasy caption styles",
    itemListElement: SEO_LOOKS.filter((l) => isReleased(l.slug)).map((l, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/styles/${l.slug}`, name: l.name })),
  };
  return (
    <SeoShell crumbs={[{ name: "Caption styles", href: "/styles" }]}>
      <JsonLd data={itemList} />
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6">
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-6xl">
          Animated caption styles, <span className="font-serif font-normal italic">all free</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[#1A1A1A]/70">
          CaptionsEasy has {TOTAL_LOOKS} caption looks you can put on a Reel, Short or TikTok in a few clicks, and every one of them is timed to the
          words you speak, so pick the feel you want below and change the font and colours later until it looks like yours.
        </p>
        <div className="mt-7"><StartCta label="Caption a video free" /></div>
      </section>
      {groups.map((g) => (
        <section key={g.section} className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-bold tracking-tight">{g.section}</h2>
            {SECTION_COPY[g.section] && <p className="text-sm text-[#1A1A1A]/55">Best for {SECTION_COPY[g.section].bestFor}</p>}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {g.looks.map((l) => <LookCard key={l.id} look={l} />)}
          </div>
        </section>
      ))}
    </SeoShell>
  );
}
