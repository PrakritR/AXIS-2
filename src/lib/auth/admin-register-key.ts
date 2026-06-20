import "server-only";
import { getAdminRegisterKey } from "@/lib/server-env";

/**
 * Validates the admin registration key on the server. The expected key is
 * resolved from server-only env (AXIS_ADMIN_REGISTER_KEY) and is never exposed
 * to the client. Fails closed when no key is configured in production.
 */
export function isValidAdminRegisterKey(key: string): boolean {
  const expected = getAdminRegisterKey();
  if (!expected) return false;
  return key.trim() === expected;
}
