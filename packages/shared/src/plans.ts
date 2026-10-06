export interface PlanLimits {
  maxUploadBytes: number;
  /** biggest file kept on the device (videos are never uploaded; this only protects the browser's storage quota) */
  maxLocalBytes: number;
  maxDurationSec: number;
  cloudAsrMinutesPerMonth: number;
  exportRetentionDays: number;
  maxProjects: number;
}

export const PLANS: Record<"free" | "pro", PlanLimits> = {
  free: { maxUploadBytes: 50 * 1024 * 1024, maxLocalBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60, cloudAsrMinutesPerMonth: 30, exportRetentionDays: 7, maxProjects: 10 },
  pro: { maxUploadBytes: 2 * 1024 * 1024 * 1024, maxLocalBytes: 8 * 1024 * 1024 * 1024, maxDurationSec: 3 * 3600, cloudAsrMinutesPerMonth: 600, exportRetentionDays: 60, maxProjects: 1000 },
};

export const planFor = (plan: string | null | undefined): PlanLimits => (plan === "pro" ? PLANS.pro : PLANS.free);
