import { describe, expect, it } from "vitest";

// Pure helper logic mirrored from work-order-notification.server.ts
function workOrderSmsBody(
  event: string,
  input: { title: string; propertyLabel?: string; note?: string },
): string {
  const title = input.title.trim() || "Work order";
  const at = input.propertyLabel?.trim() ? ` at ${input.propertyLabel.trim()}` : "";
  switch (event) {
    case "completed":
      return `Your work order "${title}"${at} has been completed.`;
    case "vendor_marked_done":
      return `"${title}"${at} marked done${input.note ? `: ${input.note.slice(0, 120)}` : ""}. Review in Work Orders.`;
    default:
      return `"${title}"${at} update from PropLane.`;
  }
}

describe("work order SMS bodies", () => {
  it("formats completion message", () => {
    expect(workOrderSmsBody("completed", { title: "Leaky faucet", propertyLabel: "Oak St" })).toContain(
      "Leaky faucet",
    );
  });

  it("includes vendor note when marking done", () => {
    expect(workOrderSmsBody("vendor_marked_done", { title: "HVAC", note: "Filter replaced" })).toContain(
      "Filter replaced",
    );
  });
});
