/** No-op mocks for external services in integration tests. */
import { vi } from "vitest";

export function mockExternalServices() {
  vi.mock("@/lib/twilio", () => ({
    sendSms: vi.fn().mockResolvedValue({ ok: true }),
  }));
}
