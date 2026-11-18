import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/home/Sections";
import { SITE_URL } from "@/lib/seo/content";

/** Header + footer for the public search pages. Server-rendered: these pages must read fully without JavaScript. */
export function SeoShell({ crumbs, children }: { crumbs: { name: string; href: string }[]; children: React.ReactNode }) {
  const trail = [{ name: "CaptionsEasy", href: "/" }, ...crumbs];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.href === "/" ? "" : c.href}` })),
  };
  return (
    <div className="min-h-screen bg-[#FFFFEB] text-[#1A1A1A]">
      <JsonLd data={breadcrumbLd} />
      <header className="sticky top-0 z-30 border-b border-[#1A1A1A]/10 bg-[#FFFFEB]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="CaptionsEasy home">
            <Logo tone="dark" height={26} />
          </Link>
          <nav className="flex items-center gap-2 text-sm sm:gap-5">
            <Link href="/styles" className="hidden px-2 py-2 text-[#1A1A1A]/70 transition-colors hover:text-[#1A1A1A] sm:inline">Caption styles</Link>
            <Link href="/#faq" className="hidden px-2 py-2 text-[#1A1A1A]/70 transition-colors hover:text-[#1A1A1A] sm:inline">FAQ</Link>
            <StartCta small />
          </nav>
        </div>
      </header>
      <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-4 pt-6 text-xs text-[#1A1A1A]/55 sm:px-6">
        {trail.map((c, i) => (
          <span key={c.href}>
            {i > 0 && <span className="mx-1.5">/</span>}
            {i < trail.length - 1 ? <Link href={c.href} className="hover:underline underline-offset-4">{c.name}</Link> : <span aria-current="page">{c.name}</span>}
          </span>
        ))}
      </nav>
      <main>{children}</main>
      <Footer />
    </div>
  );
}

export function StartCta({ small = false, label = "Start free" }: { small?: boolean; label?: string }) {
  return (
    <Link
      href="/start"
      data-cta="seo-start"
      className={`inline-flex items-center justify-center rounded-full bg-[#1A1A1A] font-semibold text-[#FFFFEB] transition-transform duration-300 [transition-timing-function:cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 ${small ? "px-4 py-2 text-sm" : "px-6 py-3 text-[15px]"}`}
    >
      {label}
    </Link>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** A look's recorded preview: poster first (no download until it scrolls near), then the loop plays muted. */
export function LookVideo({ id, name, eager = false }: { id: string; name: string; eager?: boolean }) {
  return (
    <video
      src={`/looks/${id}.mp4`}
      poster={`/looks/${id}.webp`}
      muted
      loop
      autoPlay
      playsInline
      preload={eager ? "auto" : "none"}
      aria-label={`${name} caption style preview`}
      className="h-full w-full object-contain"
    />
  );
}

export function LookCard({ look }: { look: { id: string; slug: string; name: string; description: string } }) {
  return (
    <Link href={`/styles/${look.slug}`} className="group block">
      <div className="aspect-[8/3] overflow-hidden rounded-2xl bg-[#14201C] ring-1 ring-[#1A1A1A]/10 transition-transform duration-500 [transition-timing-function:cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/looks/${look.id}.webp`} alt={`${look.name} animated caption style`} loading="lazy" decoding="async" className="h-full w-full object-contain" />
      </div>
      <p className="mt-3 text-sm font-semibold">{look.name}</p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#1A1A1A]/60">{look.description}</p>
    </Link>
  );
}

export function FaqList({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-[#1A1A1A]/10 border-y border-[#1A1A1A]/10">
      {faqs.map((f) => (
        <details key={f.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-semibold">
            {f.q}
            <span className="text-xl leading-none text-[#1A1A1A]/40 transition-transform duration-300 group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#1A1A1A]/70">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
