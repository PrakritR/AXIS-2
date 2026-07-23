import { describe, it, expect } from "vitest";
import {
  normalizePendingActions,
  pendingActionChipContent,
  type PendingActionListItem,
} from "@/lib/axis-assistant/pending-action-display";

/**
 * The dashboard "AI drafts" chips render from the loosely-typed
 * `/api/agent/pending-actions` payload. These pin the normalization (drop
 * malformed rows, never throw) and the chip title/subtitle shape that must
 * match the marketing mock ("PropLane · Rent reminder draft").
 */
describe("normalizePendingActions", () => {
  it("keeps well-formed actions and coerces field values to strings", () => {
    const out = normalizePendingActions({
      actions: [
        {
          id: "pa_1",
          toolName: "send_rent_reminders",
          preview: {
            kind: "send_rent_reminders",
            title: "Rent reminder",
            confirmLabel: "Send reminder",
            fields: [{ label: "Recipient", value: "Jordan Lee" }],
            warnings: ["Sends immediately"],
          },
          createdAt: "2026-07-23T00:00:00.000Z",
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("pa_1");
    expect(out[0]!.preview.title).toBe("Rent reminder");
    expect(out[0]!.preview.fields[0]).toEqual({ label: "Recipient", value: "Jordan Lee" });
    expect(out[0]!.preview.warnings).toEqual(["Sends immediately"]);
  });

  it("drops rows missing an id or a preview title, and never throws on junk", () => {
    const out = normalizePendingActions({
      actions: [
        { id: "", preview: { title: "x" } },
        { id: "pa_2", preview: { title: "" } },
        { id: "pa_3" },
        { id: "pa_4", preview: { title: "Good", fields: "not-an-array" } },
        null,
        42,
      ],
    });
    expect(out.map((a) => a.id)).toEqual(["pa_4"]);
    expect(out[0]!.preview.fields).toEqual([]);
    expect(out[0]!.preview.confirmLabel).toBe("Confirm");
  });

  it("returns an empty list for non-object / missing payloads", () => {
    expect(normalizePendingActions(null)).toEqual([]);
    expect(normalizePendingActions({})).toEqual([]);
    expect(normalizePendingActions({ actions: "nope" })).toEqual([]);
  });
});

describe("pendingActionChipContent", () => {
  const base: PendingActionListItem = {
    id: "pa_1",
    toolName: "send_rent_reminders",
    preview: {
      kind: "send_rent_reminders",
      title: "Rent reminder",
      confirmLabel: "Send reminder",
      fields: [
        { label: "Recipient", value: "Jordan Lee · Maple 2A" },
        { label: "Amount", value: "$1,240" },
      ],
    },
    createdAt: null,
  };

  it("prefixes the title with PropLane and ends the subtitle with 'ready to approve'", () => {
    const { title, subtitle } = pendingActionChipContent(base);
    expect(title).toBe("PropLane · Rent reminder");
    expect(subtitle).toBe("Jordan Lee · Maple 2A · ready to approve");
  });

  it("falls back to the first field when no recipient-like field exists", () => {
    const { subtitle } = pendingActionChipContent({
      ...base,
      preview: { ...base.preview, fields: [{ label: "Charge", value: "July rent" }] },
    });
    expect(subtitle).toBe("July rent · ready to approve");
  });

  it("still produces a subtitle when there are no fields", () => {
    const { subtitle } = pendingActionChipContent({
      ...base,
      preview: { ...base.preview, fields: [] },
    });
    expect(subtitle).toBe("ready to approve");
  });
});
