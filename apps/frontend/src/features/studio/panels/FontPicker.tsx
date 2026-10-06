"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Laptop, Loader2, Search } from "lucide-react";
import { FONT_CATEGORIES, GOOGLE_FONTS, POPULAR_FONTS, deviceHasFont, fontStack, getFontEntry, loadFontFamily, loadFontPreview, type FontCategory, type FontEntry } from "@capseasy/templates";

type LocalFontData = { family: string };
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

/** Draws a font's name in that font. Google previews fetch only the letters of the name (a few KB). */
const FontName: React.FC<{ family: string; root: React.RefObject<HTMLElement | null>; className?: string }> = ({ family, root, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [css, setCss] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void loadFontPreview(family).then((c) => alive && setCss(c));
      },
      { root: root.current, rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [family, root]);
  return (
    <span ref={ref} className={`${className ?? ""} transition-opacity duration-150 ${css ? "opacity-100" : "opacity-40"}`} style={{ fontFamily: css ?? "inherit" }}>
      {family}
    </span>
  );
};

function deviceNote(e: FontEntry): string | null {
  if (e.source !== "device") return null;
  return deviceHasFont(e.family) ? "On this device" : `Not installed · shows as ${e.fallback}`;
}

interface Props {
  label: string;
  value: string;
  onChange: (family: string) => void;
}

/**
 * Font chooser: creator favourites (Helvetica, Open Sauce, Coolvetica…) first, then Google Fonts by category.
 * Each name is drawn in its own face; the full font downloads only when picked.
 */
export const FontPicker: React.FC<Props> = ({ label, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<FontCategory | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<string[] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [currentCss, setCurrentCss] = useState<string>(fontStack(value));

  useEffect(() => {
    let alive = true;
    setCurrentCss(fontStack(value));
    void loadFontFamily(value).then(() => alive && setCurrentCss(fontStack(value)));
    return () => {
      alive = false;
    };
  }, [value]);

  const q = query.trim().toLowerCase();
  const match = (f: string) => !q || f.toLowerCase().includes(q);
  const popular = useMemo(() => POPULAR_FONTS.filter((f) => match(f.family) && (cat === "all" || f.category === cat)), [q, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const google = useMemo(() => GOOGLE_FONTS.filter((f) => match(f.family) && (cat === "all" || f.category === cat)), [q, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const localShown = useMemo(() => (local ?? []).filter(match), [local, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (family: string) => {
    setBusy(family);
    try {
      await loadFontFamily(family);
    } finally {
      setBusy(null);
    }
    onChange(family);
  };

  const showLocal = async () => {
    setLocalError(null);
    try {
      const fonts = await window.queryLocalFonts!();
      setLocal([...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b)));
    } catch {
      setLocalError("Your browser didn't share this computer's fonts.");
    }
  };

  const row = (family: string, note: string | null) => (
    <button
      key={family}
      type="button"
      role="option"
      aria-selected={family === value}
      onClick={() => void pick(family)}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-st-hover ${family === value ? "bg-st-lav" : ""}`}
    >
      <span className="min-w-0">
        <FontName family={family} root={listRef} className="block truncate text-[17px] leading-tight text-st-text" />
        {note ? <span className="block truncate text-[11px] text-st-faint">{note}</span> : null}
      </span>
      {busy === family ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-st-muted" /> : family === value ? <Check className="h-4 w-4 shrink-0 text-st-text" /> : null}
    </button>
  );

  const current = getFontEntry(value);
  return (
    <div className="text-sm text-st-text/90">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex max-w-[60%] items-center gap-2 rounded-md border border-st-line bg-st-panel px-2.5 py-1 text-st-text outline-none hover:bg-st-hover focus-visible:border-st-lav-strong"
        >
          <span className="truncate text-[15px]" style={{ fontFamily: currentCss }}>{value}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-st-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {current?.source === "device" && !deviceHasFont(value) ? <p className="mt-1 text-right text-[11px] text-st-faint">{value} isn&apos;t installed here, so it shows as {current.fallback}.</p> : null}

      {open ? (
        <div className="mt-2 rounded-lg border border-st-line bg-st-panel">
          <div className="border-b border-st-line p-2">
            <label className="flex items-center gap-2 rounded-md bg-st-raised px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-st-muted" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fonts" className="w-full bg-transparent text-sm outline-none placeholder:text-st-faint" />
            </label>
            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
              {[{ id: "all" as const, label: "All" }, ...FONT_CATEGORIES].map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${cat === c.id ? "bg-st-ink text-st-panel" : "bg-st-raised text-st-muted hover:bg-st-hover"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div ref={listRef} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto p-1.5">
            {popular.length ? (
              <>
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-st-muted">Popular</div>
                {popular.map((f) => row(f.family, deviceNote(f)))}
              </>
            ) : null}
            {local !== null ? (
              <>
                <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-st-muted">On this computer</div>
                <p className="px-2.5 pb-1 text-[11px] text-st-faint">These show only on this computer.</p>
                {localShown.map((f) => row(f, null))}
              </>
            ) : null}
            {google.length ? (
              <>
                <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-st-muted">Google Fonts</div>
                {google.map((f) => row(f.family, null))}
              </>
            ) : null}
            {!popular.length && !google.length && !localShown.length ? <p className="px-2.5 py-6 text-center text-xs text-st-faint">No font called &ldquo;{query}&rdquo;.</p> : null}
          </div>
          {typeof window !== "undefined" && window.queryLocalFonts && local === null ? (
            <div className="border-t border-st-line p-2">
              <button type="button" onClick={() => void showLocal()} className="flex w-full items-center justify-center gap-2 rounded-md bg-st-raised px-2.5 py-1.5 text-xs hover:bg-st-hover">
                <Laptop className="h-3.5 w-3.5" /> Use fonts installed on this computer
              </button>
              {localError ? <p className="mt-1 text-center text-[11px] text-st-faint">{localError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
