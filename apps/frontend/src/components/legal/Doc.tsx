import React from "react";
import { LEGAL } from "@/lib/legal";

/** Title block + readable prose column shared by every legal page. */
export function LegalDoc({ title, accent, intro, children }: { title: string; accent: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-obsidian/50">Effective {LEGAL.effective}</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        {title} <em className="text-obsidian/70">{accent}</em>
      </h1>
      <div className="mt-5 text-lg leading-relaxed text-obsidian/75">{intro}</div>
      <div className="mt-10 space-y-10">{children}</div>
      <p className="mt-14 rounded-2xl border border-obsidian/10 bg-muted-beige/40 p-5 text-sm leading-relaxed text-obsidian/70">
        Questions about this document? Write to <strong className="text-obsidian">{LEGAL.email}</strong>. {LEGAL.operator}, {LEGAL.address}.
      </p>
    </article>
  );
}

export function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
        <a href={`#${id}`} className="hover:underline hover:decoration-orange-accent hover:decoration-2 hover:underline-offset-4">{title}</a>
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-obsidian/80 [&_a]:font-medium [&_a]:underline [&_a]:decoration-orange-accent [&_a]:decoration-2 [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-obsidian [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
