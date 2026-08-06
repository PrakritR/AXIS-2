import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const portalSource = (filename: string) =>
  readFileSync(join(process.cwd(), "src/components/portal", filename), "utf8");

describe("scheduled message modal layout", () => {
  it("opens manager scheduled-message detail in a dialog with the inline scheduled card", () => {
    const source = portalSource("manager-inbox-schedule-panel.tsx");

    expect(source).toContain('title="Scheduled message"');
    expect(source).toContain("InboxScheduledCard");
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).not.toContain("PORTAL_TABLE_DETAIL_ROW");
    expect(source).not.toContain("PortalTableExpandChevron");
  });

  it("uses the responsive modal for admin schedule creation and editing", () => {
    const panel = portalSource("admin-inbox-schedule-panel.tsx");
    const client = portalSource("admin-inbox-client.tsx");

    expect(panel).toContain('data-attr="admin-schedule-message"');
    expect(panel).toContain('title="Edit scheduled message"');
    expect(client).toContain('title={initialSchedule ? "Schedule message" : "New message"}');
  });
});
