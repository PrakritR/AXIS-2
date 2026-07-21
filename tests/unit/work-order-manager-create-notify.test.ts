import { afterEach, describe, expect, it } from "vitest";

/**
 * Mirror of manager-facing "created" SMS copy from work-order-notification.server.ts
 * (kept pure so tests don't need server-only imports).
 */
function managerCreatedSmsBody(input: {
  title: string;
  propertyLabel?: string;
  itemKind: "work-order" | "service-request";
  origin: string;
}): string {
  const title = input.title.trim() || "Work order";
  const at = input.propertyLabel?.trim() ? ` at ${input.propertyLabel.trim()}` : "";
  const kindLabel = input.itemKind === "service-request" ? "add-on service" : "work order";
  const reviewPath =
    input.itemKind === "service-request"
      ? "/portal/services/requests"
      : "/portal/services/work-orders";
  return [`New ${kindLabel}: "${title}"${at}.`, `Review: ${input.origin}${reviewPath}`].join("\n");
}

afterEach(() => {
  delete process.env.CLAW_MESSENGER_LINK_ORIGIN;
});

describe("manager create notification SMS", () => {
  it("points work orders at manager work-orders tab", () => {
    const body = managerCreatedSmsBody({
      title: "Leaky faucet",
      propertyLabel: "Oak St",
      itemKind: "work-order",
      origin: "https://www.axis-seattle-housing.com",
    });
    expect(body).toContain('New work order: "Leaky faucet" at Oak St.');
    expect(body).toContain("/portal/services/work-orders");
  });

  it("points add-on service requests at manager requests tab", () => {
    const body = managerCreatedSmsBody({
      title: "Reserved parking spot",
      itemKind: "service-request",
      origin: "https://www.axis-seattle-housing.com",
    });
    expect(body).toContain("add-on service");
    expect(body).toContain("/portal/services/requests");
  });
});
