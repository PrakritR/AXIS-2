export { snapshotJordanLee } from "@/data/manager-application-snapshots";

export const TEST_RUN_PREFIX = "e2e-test";

export function testRunId(): string {
  return `${TEST_RUN_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// `?.trim() ||` (never `??`): GitHub Actions injects a MISSING secret as an empty
// string, which must fall back to the seeded defaults just like an unset var.
// tests/global-setup.ts and tests/helpers/seed-test-db.mjs resolve identically.
export const E2E_ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL?.trim() || "admin@test.axis.local",
    password: process.env.E2E_ADMIN_PASSWORD?.trim() || "TestAdmin123!",
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL?.trim() || "manager@test.axis.local",
    password: process.env.E2E_MANAGER_PASSWORD?.trim() || "TestManager123!",
  },
  resident: {
    email: process.env.E2E_RESIDENT_EMAIL?.trim() || "resident@test.axis.local",
    password: process.env.E2E_RESIDENT_PASSWORD?.trim() || "TestResident123!",
  },
  vendor: {
    email: process.env.E2E_VENDOR_EMAIL?.trim() || "vendor@test.axis.local",
    password: process.env.E2E_VENDOR_PASSWORD?.trim() || "TestVendor123!",
  },
};

// Must match the axis id seeded by tests/helpers/seed-test-db.mjs (same env var +
// default there): it is both the application record id and the resident's
// profiles.manager_id.
export const E2E_RESIDENT_AXIS_ID = process.env.E2E_RESIDENT_AXIS_ID?.trim() || "AXIS-TESTRSID";
