"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { BrandNavProvider } from "@/components/brand/BrandNav";
import { DashboardSkeleton, StudioSkeleton } from "@/components/brand/Skeletons";
import StudioShell from "@/components/studio/StudioShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      if (authService.isAuthenticated()) {
        if (!cancelled) setAuthorized(true);
        return;
      }
      const { supabase } = await import("@/services/auth/supabaseClient");
      const { startGuestSession } = await import("@/services/auth/guest");
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        if (!cancelled) setAuthorized(true);
        return;
      }

      // Automatically start a guest session for visitors trying to use studio/dashboard
      const guestOk = await startGuestSession();
      if (guestOk) {
        if (!cancelled) setAuthorized(true);
        return;
      }

      if (!cancelled) {
        router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
    }

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // until the stored session is read, show the shape of the page that is about to appear (this is in the server HTML too)
  if (!authorized) {
    return pathname.startsWith("/projects/") ? (
      <StudioSkeleton />
    ) : (
      <StudioShell>
        <DashboardSkeleton />
      </StudioShell>
    );
  }

  return <BrandNavProvider>{children}</BrandNavProvider>;
}
