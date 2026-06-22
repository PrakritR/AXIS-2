import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createTestSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for integration tests.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasTestSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function buildPropertyRecordRow(managerId: string, testRunId: string, propertyData: Record<string, unknown> = {}) {
  return {
    manager_id: managerId,
    row_data: {
      id: `test-prop-${testRunId}`,
      status: "pending",
      name: `Test Property ${testRunId}`,
      ...propertyData,
    },
  };
}

export function buildApplicationRecordRow(managerId: string, testRunId: string) {
  return {
    manager_id: managerId,
    row_data: {
      id: `test-app-${testRunId}`,
      status: "submitted",
      applicantName: "Test Applicant",
      email: `applicant-${testRunId}@test.axis.local`,
    },
  };
}
