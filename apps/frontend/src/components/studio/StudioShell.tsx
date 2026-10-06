"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/brand/Logo";
import { authService } from "@/services/auth";
import { User } from "@/services/types";
import { FEEDBACK_MAILTO } from "@/lib/legal";

type HealthChecks = { database: boolean; queue: boolean };

// same-origin readiness probe (database + Postgres job queue)
const HEALTH_URL = "/health/ready";
/** The service-status widget is a developer aid: shown on localhost (next dev), never on the live site. */
const SHOW_HEALTH = process.env.NODE_ENV !== "production";

const NAV = [
  {
    href: "/dashboard",
    label: "Projects",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M8 5v5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path
          strokeLinecap="round"
          d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10.05 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01c.26.63.87 1.04 1.56 1.04H21a2 2 0 1 1 0 4h-.09c-.69 0-1.3.41-1.51 1.04z"
        />
      </svg>
    ),
  },
];

function HealthRow({ label, ok, pending }: { label: string; ok?: boolean; pending: boolean }) {
  return (
    <div className="flex items-center justify-between font-mono text-[11px]">
      <span className="text-sand-600">{label}</span>
      <span className={`flex items-center gap-1.5 ${pending ? "text-sand-500" : ok ? "text-sand-800" : "text-obsidian"}`}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            pending ? "bg-sand-300" : ok ? "bg-emerald-accent" : "bg-orange-accent"
          }`}
        />
        {pending ? "…" : ok ? "online" : "down"}
      </span>
    </div>
  );
}

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    authService.getCurrentUser().then(setUser);
  }, []);

  const { data: health } = useQuery<HealthChecks | null>({
    queryKey: ["health"],
    enabled: SHOW_HEALTH,
    queryFn: async () => {
      try {
        const res = await fetch(HEALTH_URL);
        const body = await res.json();
        return body.checks as HealthChecks;
      } catch {
        return null;
      }
    },
    refetchInterval: 30000,
    retry: false,
  });

  const handleSignOut = async () => {
    try {
      await authService.logout();
    } finally {
      router.push("/login");
    }
  };

  const healthy = health ? health.database && health.queue : undefined;
  return (
    <div className="min-h-screen bg-dune-white md:flex">
      {/* Mobile top bar (sidebar is hidden below md) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sand-200 bg-sand-50/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/dashboard" aria-label="CaptionsEasy projects">
          <Logo height={24} />
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-label={item.label} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 font-sora text-[12px] font-semibold ${pathname === item.href ? "bg-sand-200 text-ink" : "text-sand-700"}`}>
              {item.icon}
              <span className="hidden min-[400px]:inline">{item.label}</span>
            </Link>
          ))}
          {SHOW_HEALTH ? <span title={healthy === undefined ? "Checking service" : healthy ? "All systems running" : "Service problem"} className={`ml-1 h-2 w-2 rounded-full ${healthy === undefined ? "bg-sand-300" : healthy ? "bg-emerald-accent" : "bg-orange-accent"}`} /> : null}
          <button onClick={handleSignOut} aria-label="Sign out" className="ml-1 rounded-lg p-2 text-sand-600 hover:bg-sand-100 hover:text-ink">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H9m4 7H7a2 2 0 01-2-2V5a2 2 0 012-2h6" /></svg>
          </button>
        </nav>
      </header>

      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sand-200 bg-sand-50 md:flex">
        <div className="px-5 py-6">
          <Link href="/dashboard" aria-label="CaptionsEasy projects">
            <Logo height={26} />
          </Link>
        </div>

        <nav className="px-3 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-sora text-[13px] font-semibold transition-colors ${
                  active
                    ? "bg-sand-200 text-ink"
                    : "text-sand-700 hover:bg-sand-100 hover:text-ink"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <a href={FEEDBACK_MAILTO} className="mx-3 mb-3 flex items-center gap-3 rounded-lg px-3 py-2.5 font-sora text-[13px] font-semibold text-sand-700 transition-colors hover:bg-sand-100 hover:text-ink">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v11H8l-4 4V5z" /></svg>
            Send feedback
          </a>

          {/* Render service health (local dev only) */}
          {SHOW_HEALTH ? <div className="mx-5 mb-4 rounded-lg border border-sand-200 bg-white px-4 py-3 space-y-2">
            <p className="font-sora text-[11px] font-semibold text-sand-700">Service status</p>
            <HealthRow label="database" ok={health?.database} pending={health === undefined} />
            <HealthRow label="job queue" ok={health?.queue} pending={health === undefined} />
            {health === null && (
              <p className="pt-1 text-[11px] leading-snug text-sand-600">
                Backend unreachable — uploads and renders are paused.
              </p>
            )}
          </div> : null}

          {/* User + sign out */}
          <div className="border-t border-sand-200 px-5 py-4 flex items-center gap-3">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full border border-sand-200 bg-white"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-sand-200" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-sora text-[13px] font-semibold text-ink">
                {user?.name ?? "…"}
              </p>
              <p className="truncate text-[11px] text-sand-600">{user?.email ?? ""}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-2 rounded-lg text-sand-600 hover:text-ink hover:bg-sand-100 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H9m4 7H7a2 2 0 01-2-2V5a2 2 0 012-2h6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
