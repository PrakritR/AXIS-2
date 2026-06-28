import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();

function chain() {
  const self = {
    select: vi.fn(() => self),
    eq: eqMock.mockImplementation(() => self),
    or: vi.fn(() => self),
    maybeSingle: vi.fn(),
    update: updateMock.mockImplementation(() => self),
    insert: vi.fn(() => self),
    in: vi.fn(() => self),
  };
  return self;
}

describe("transferPropertyOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(() => chain());
  });

  it("rejects when caller is not property owner", async () => {
    const db = { from: fromMock } as never;
    const { transferPropertyOwnership } = await import("@/lib/property-ownership-transfer");

    const propertyChain = chain();
    propertyChain.maybeSingle.mockResolvedValue({
      data: { id: "prop-1", manager_user_id: "other-user", property_data: {} },
      error: null,
    });
    fromMock.mockReturnValueOnce(propertyChain);

    const result = await transferPropertyOwnership(db, {
      propertyId: "prop-1",
      currentOwnerUserId: "owner-1",
      newManagerUserId: "new-1",
      formerOwnerPermissions: { applications: true },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });
});
