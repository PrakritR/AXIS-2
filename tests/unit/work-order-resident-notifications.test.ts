import { describe, expect, it, vi } from "vitest";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import {
  buildResidentWorkOrderUpdate,
  notifyResidentOfWorkOrderUpdate,
} from "@/lib/work-order-resident-notifications";

const baseRow: DemoManagerWorkOrderRow = {
  id: "WO-1",
  propertyName: "Elm House",
  unit: "Unit 2",
  title: "Leaky faucet",
  priority: "Medium",
  status: "Scheduled",
  bucket: "scheduled",
  description: "Kitchen faucet drips",
  scheduled: "—",
  cost: "—",
  residentEmail: "resident@test.com",
};

describe("buildResidentWorkOrderUpdate", () => {
  it("builds a vendor_assigned update naming the vendor", () => {
    const { subject, text } = buildResidentWorkOrderUpdate("vendor_assigned", {
      ...baseRow,
      vendorName: "Alex Plumbing",
    });
    expect(subject).toBe('Update on "Leaky faucet": vendor assigned');
    expect(text).toContain("Alex Plumbing");
    expect(text).toContain("Leaky faucet");
  });

  it("builds a visit_scheduled update embedding the scheduled label", () => {
    const { subject, text } = buildResidentWorkOrderUpdate("visit_scheduled", baseRow, {
      scheduledLabel: "Jul 10, 2:00 PM",
    });
    expect(subject).toContain("Jul 10, 2:00 PM");
    expect(text).toContain("Jul 10, 2:00 PM");
  });
});

describe("notifyResidentOfWorkOrderUpdate", () => {
  it("no-ops without a resident email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await notifyResidentOfWorkOrderUpdate("vendor_assigned", { ...baseRow, residentEmail: undefined });
    expect(result).toEqual({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("posts the subject/text to send-inbox-message for the resident's email", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await notifyResidentOfWorkOrderUpdate("vendor_assigned", { ...baseRow, vendorName: "Alex Plumbing" });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/portal/send-inbox-message");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.toEmails).toEqual(["resident@test.com"]);
    expect(body.deliverToPortalInbox).toBe(true);
    expect(body.deliverViaEmail).toBe(true);
    expect(body.deliverViaSms).toBe(true);
    vi.unstubAllGlobals();
  });

  it("suppresses email and SMS when viaEmail/viaSms are false", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await notifyResidentOfWorkOrderUpdate("vendor_assigned", { ...baseRow, vendorName: "Alex Plumbing" }, { viaEmail: false, viaSms: false });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as { body: string }).body);
    expect(body.deliverViaEmail).toBe(false);
    expect(body.deliverViaSms).toBe(false);
    vi.unstubAllGlobals();
  });

  it("ignores network errors and reports failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const result = await notifyResidentOfWorkOrderUpdate("visit_scheduled", baseRow, { scheduledLabel: "soon" });
    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });
});
