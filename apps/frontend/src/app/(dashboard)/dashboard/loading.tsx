import { DashboardSkeleton } from "@/components/brand/Skeletons";
import StudioShell from "@/components/studio/StudioShell";

export default function Loading() {
  return (
    <StudioShell>
      <DashboardSkeleton />
    </StudioShell>
  );
}
