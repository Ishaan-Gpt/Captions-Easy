import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LANDINGS, SEO_LOOKS, SECTION_COPY, lookBySlug } from "@/lib/seo/content";
import { FaqList, LookCard, LookVideo, SeoShell, StartCta } from "@/components/seo/SeoShell";
import { releaseFor } from "@/lib/seo/releases";

export const dynamicParams = false;
export const generateStaticParams = () => SEO_LOOKS.map((l) => ({ slug: l.slug }));

type Props = { params: Promise<{ slug: string }> };

/** Cut at a word boundary so search snippets never end mid-word. */
const clip = (text: string, max: number) => (text.length <= max ? text : text.slice(0, text.lastIndexOf(" ", max)).replace(/[,;:]$/, ""));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const look = lookBySlug((await params).slug);
  if (!look) return {};
  const release = releaseFor(look.slug);
  const name = release?.searchName ?? `${look.name} Caption Style`;
  return {
    title: `${name}, Free | CaptionsEasy`,
    description: `${clip(release?.intro ?? look.description, 110)}. Add it to Reels and Shorts free, with no watermark.`,
    alternates: { canonical: `/styles/${look.slug}` },
    // not yet written up: reachable for people, kept out of search until its release (lib/seo/releases.ts)
    ...(release ? {} : { robots: { index: false, follow: true } }),
    openGraph: { images: [{ url: `/looks/${look.id}.webp`, alt: `${look.name} caption style` }] },
  };
}

export default async function StylePage({ params }: Props) {
  const look = lookBySlug((await params).slug);
  if (!look) notFound();
  const copy = SECTION_COPY[look.section] ?? SECTION_COPY[look.category];
  const release = releaseFor(look.slug);
  const instead = release ? SEO_LOOKS.find((l) => l.slug === release.avoid.instead || l.id === release.avoid.instead) : undefined;
  const related = SEO_LOOKS.filter((l) => l.section === look.section && l.id !== look.id).slice(0, 5);
  const usedOn = LANDINGS.filter((p) => p.looks.includes(look.id));
  const faqs = [
    { q: `How do I add the ${look.name} captions to my video?`, a: `Open CaptionsEasy, add your video and let it write the captions, then choose ${look.name} from the ${look.section} looks and export an MP4. It all happens in your browser and there is nothing to install.` },
    { q: `Can I change the colours and font of ${look.name}?`, a: "Yes. Every look is a starting point, so you can change the font, colours, outline, size, position and motion, then save the result as a brand kit to reuse." },
    { q: `Is ${look.name} free to use?`, a: "Yes. Every caption look and both MP4 and SRT exports are free with no watermark, for videos up to 5 minutes long." },
  ];
  return (
    <SeoShell crumbs={[{ name: "Caption styles", href: "/styles" }, { name: look.name, href: `/styles/${look.slug}` }]}>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 md:grid-cols-[1fr_minmax(0,480px)] md:items-center lg:gap-16">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[#1A1A1A]/50">{look.section} caption style · #{look.number}</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-6xl">{release?.searchName ?? `${look.name} captions`}</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#1A1A1A]/75">{release?.intro ?? `${look.description}.`}</p>
          {release ? (
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#1A1A1A]/65">In the studio it is called {look.name}. {look.description}.</p>
          ) : (
            copy && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#1A1A1A]/65">{copy.fit}</p>
          )}
          {look.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {look.tags.map((t) => <li key={t} className="rounded-full border border-[#1A1A1A]/15 px-3 py-1 text-xs text-[#1A1A1A]/70">{t}</li>)}
              {look.font && <li className="rounded-full border border-[#1A1A1A]/15 px-3 py-1 text-xs text-[#1A1A1A]/70">Font: {look.font}</li>}
            </ul>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <StartCta label={`Use ${look.name} free`} />
            <Link href="/styles" className="text-sm font-medium text-[#1A1A1A]/70 underline-offset-4 hover:underline">See all styles</Link>
          </div>
        </div>
        <div className="mx-auto aspect-[8/3] w-full max-w-[480px] overflow-hidden rounded-[24px] bg-[#14201C] shadow-[0_30px_60px_-30px_rgba(26,26,26,0.45)]">
          <LookVideo id={look.id} name={look.name} eager />
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Where {look.name} works best</h2>
            {release ? (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-[#1A1A1A]/70">{release.whoUses}</p>
                <h3 className="mt-6 text-base font-bold">When to pick something else</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#1A1A1A]/70">
                  {release.avoid.when}
                  {instead && (
                    <>
                      {" "}Try <Link href={`/styles/${instead.slug}`} className="font-medium text-[#0F3D2E] underline underline-offset-4">{instead.name}</Link> instead.
                    </>
                  )}
                </p>
                <h3 className="mt-6 text-base font-bold">Getting it right</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#1A1A1A]/70">{release.tip}</p>
              </>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-[#1A1A1A]/70">
                It suits {copy?.bestFor ?? "Reels, Shorts and TikToks"}, and because every word is timed to your voice, the motion lands on the beat of
                what you say instead of on a fixed clock.
              </p>
            )}
            {usedOn.length > 0 && (
              <div className="mt-6">
                <h3 className="text-base font-bold">Featured in</h3>
                <ul className="mt-2 space-y-1.5 text-[15px]">
                  {usedOn.map((p) => (
                    <li key={p.slug}><Link href={`/${p.slug}`} className="font-medium text-[#0F3D2E] underline underline-offset-4">{p.h1}</Link></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Add it in three steps</h2>
            <ol className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#1A1A1A]/70">
              <li><b className="text-[#1A1A1A]">1. Add your video.</b> CaptionsEasy listens to it inside your browser and writes every word with its timing, in English or Hinglish.</li>
              <li><b className="text-[#1A1A1A]">2. Pick {look.name}.</b> Fix any misheard word, then change the colours or font if you want it to match your brand.</li>
              <li><b className="text-[#1A1A1A]">3. Export.</b> Download an MP4 with the captions burned in and no watermark, or an SRT file for your editor.</li>
            </ol>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight">More {look.section.toLowerCase()} styles</h2>
          <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((l) => <LookCard key={l.id} look={l} />)}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <h2 className="mb-4 text-2xl font-bold tracking-tight">Questions</h2>
        <FaqList faqs={faqs} />
      </section>
    </SeoShell>
  );
}
