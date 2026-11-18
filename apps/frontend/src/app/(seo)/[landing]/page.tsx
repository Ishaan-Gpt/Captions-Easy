import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LANDINGS, landingBySlug, lookById, SITE_URL } from "@/lib/seo/content";
import { FaqList, JsonLd, LookCard, LookVideo, SeoShell, StartCta } from "@/components/seo/SeoShell";

// only the landing pages below exist at the root; anything else falls through to the 404 page
export const dynamicParams = false;
export const generateStaticParams = () => LANDINGS.map((l) => ({ landing: l.slug }));

type Props = { params: Promise<{ landing: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = landingBySlug((await params).landing);
  if (!page) return {};
  return { title: page.title, description: page.description, alternates: { canonical: `/${page.slug}` }, openGraph: { title: page.h1, description: page.description } };
}

export default async function LandingPage({ params }: Props) {
  const page = landingBySlug((await params).landing);
  if (!page) notFound();
  const looks = page.looks.map(lookById).filter((l) => l !== undefined);
  const hero = looks[0];
  const others = LANDINGS.filter((l) => l.slug !== page.slug);
  const ld = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.h1,
      url: `${SITE_URL}/${page.slug}`,
      description: page.description,
      isPartOf: { "@type": "WebSite", name: "CaptionsEasy", url: SITE_URL },
    },
  ];
  return (
    <SeoShell crumbs={[{ name: page.h1, href: `/${page.slug}` }]}>
      <JsonLd data={ld} />
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 md:grid-cols-[1fr_minmax(0,480px)] md:items-center lg:gap-16">
        <div>
          <h1 className="text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-6xl">{page.h1}</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#1A1A1A]/75">{page.lead}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <StartCta label="Caption a video free" />
            <span className="text-sm text-[#1A1A1A]/55">No watermark · nothing to install</span>
          </div>
        </div>
        {hero && (
          <Link href={`/styles/${hero.slug}`} className="mx-auto block aspect-[8/3] w-full max-w-[480px] overflow-hidden rounded-[24px] bg-[#14201C] shadow-[0_30px_60px_-30px_rgba(26,26,26,0.45)]">
            <LookVideo id={hero.id} name={hero.name} eager />
          </Link>
        )}
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 py-12 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {page.points.map((p) => (
            <div key={p.title}>
              <h2 className="text-lg font-bold tracking-tight">{p.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-[#1A1A1A]/70">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Styles that suit it</h2>
          <Link href="/styles" className="text-sm font-medium text-[#0F3D2E] underline underline-offset-4">Browse every caption style</Link>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2">
          {looks.map((l) => <LookCard key={l.id} look={l} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-5 grid gap-6 text-[15px] leading-relaxed text-[#1A1A1A]/70 md:grid-cols-3">
          <li><b className="block text-[#1A1A1A]">1. Add your video</b>It is transcribed inside your browser, in English or Hindi / Hinglish, with a time for every word.</li>
          <li><b className="block text-[#1A1A1A]">2. Check and style</b>Fix any word, pick a look and move the captions where you want them in the frame.</li>
          <li><b className="block text-[#1A1A1A]">3. Export</b>Download an MP4 with the captions burned in, or an SRT file, with no watermark.</li>
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-12 pt-6 sm:px-6">
        <h2 className="mb-4 text-2xl font-bold tracking-tight">Questions</h2>
        <FaqList faqs={page.faqs} />
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#1A1A1A]/10 px-4 pb-20 pt-10 sm:px-6">
        <h2 className="text-sm font-mono uppercase tracking-widest text-[#1A1A1A]/50">Also on CaptionsEasy</h2>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          {others.map((o) => <li key={o.slug}><Link href={`/${o.slug}`} className="text-[#1A1A1A]/75 underline-offset-4 hover:underline">{o.h1}</Link></li>)}
        </ul>
      </section>
    </SeoShell>
  );
}
