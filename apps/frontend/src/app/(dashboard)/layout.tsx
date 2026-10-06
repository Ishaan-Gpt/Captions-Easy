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
    if (!authService.isAuthenticated()) {
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setAuthorized(true);
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
