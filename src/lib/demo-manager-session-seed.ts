import { ensureDemoManagerSideBucketsSeed } from "@/lib/demo-admin-property-inventory";
import { ensureDemoManagerPipelineSeed } from "@/lib/demo-property-pipeline";
import { seedDemoHouseholdChargesIfEmpty } from "@/lib/household-charges";

/**
 * One-time (per empty local state) seed of manager pipeline, property side-buckets, and household charges
 * so a signed-in manager can test applications, properties, payments, and work orders without manual entry.
 */
export function ensureDemoManagerSessionSeed(managerUserId: string | null): void {
  if (!managerUserId) return;
  ensureDemoManagerPipelineSeed(managerUserId);
  ensureDemoManagerSideBucketsSeed(managerUserId);
  seedDemoHouseholdChargesIfEmpty(managerUserId);
}
