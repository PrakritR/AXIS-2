export { snapshotJordanLee } from "@/data/manager-application-snapshots";

export const TEST_RUN_PREFIX = "e2e-test";

export function testRunId(): string {
  return `${TEST_RUN_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const E2E_ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@test.axis.local",
    password: process.env.E2E_ADMIN_PASSWORD ?? "TestAdmin123!",
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL ?? "manager@test.axis.local",
    password: process.env.E2E_MANAGER_PASSWORD ?? "TestManager123!",
  },
  resident: {
    email: process.env.E2E_RESIDENT_EMAIL ?? "resident@test.axis.local",
    password: process.env.E2E_RESIDENT_PASSWORD ?? "TestResident123!",
  },
};
