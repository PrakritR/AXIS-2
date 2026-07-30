/** Seeded catalog property used across public apply/tour E2E flows. */
export const E2E_SEEDED_PROPERTY_ID = "mgr-test-fir";

export const e2eToursContactUrl = (opts?: { tab?: "tour" | "message" }) => {
  const params = new URLSearchParams({ propertyId: E2E_SEEDED_PROPERTY_ID });
  if (opts?.tab === "message") params.set("tab", "message");
  return `/rent/tours-contact?${params.toString()}`;
};
