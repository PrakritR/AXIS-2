import { describe, expect, it, vi } from "vitest";
import { linkBookedToursToSignedInResident } from "@/components/marketing/tour-schedule-flow";

describe("signed-in tour booking linkage", () => {
  it("links every newly-created inquiry to the current resident account", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const linked = await linkBookedToursToSignedInResident(["tour-a", "tour-b", "tour-a"], request);

    expect(linked).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/auth/link-tour-inquiry",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ tourInquiryId: "tour-a" }),
      }),
    );
  });

  it("reports a partial link failure without throwing away the booking", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    await expect(linkBookedToursToSignedInResident(["tour-a", "tour-b"], request)).resolves.toBe(false);
  });
});
