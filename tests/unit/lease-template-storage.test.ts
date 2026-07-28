import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectSubmissionLeaseTemplatePaths,
  deleteSubmissionLeaseTemplates,
  isLeaseTemplatePath,
  leaseTemplateObjectPath,
  leaseTemplateUrlForPath,
} from "@/lib/lease-template-storage";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

const UID = "b5809cf3-dcff-4e46-a0cc-5dcc53bc8910";
const PATH = `${UID}/1753000000000-ab12cd.pdf`;

function subWith(fields: Partial<ManagerListingSubmissionV1>): ManagerListingSubmissionV1 {
  return fields as ManagerListingSubmissionV1;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lease template object paths", () => {
  it("round-trips a path through its route URL", () => {
    expect(leaseTemplateObjectPath(leaseTemplateUrlForPath(PATH))).toBe(PATH);
  });

  it("rejects traversal and anything outside a manager folder", () => {
    for (const bad of [
      `${UID}/../../etc/passwd.pdf`,
      "../secrets.pdf",
      `${UID}/lease.pdf.exe`,
      "not-a-uuid/lease.pdf",
      `${UID}/nested/lease.pdf`,
      "",
    ]) {
      expect(isLeaseTemplatePath(bad), bad).toBe(false);
      expect(leaseTemplateObjectPath(`/api/portal/lease-template?path=${encodeURIComponent(bad)}`)).toBeNull();
    }
  });

  it("ignores a legacy public listing-photos URL and an unuploaded data URL", () => {
    expect(
      leaseTemplateObjectPath("https://x.supabase.co/storage/v1/object/public/listing-photos/u/lease.pdf"),
    ).toBeNull();
    expect(leaseTemplateObjectPath("data:application/pdf;base64,AAAA")).toBeNull();
  });

  it("does not match a foreign URL that merely contains the route", () => {
    // A substring match would let an attacker-supplied host resolve to a real
    // object path, which both the agent tool's validation and the read route's
    // "does a property reference this path" check would then trust.
    for (const foreign of [
      `https://evil.example/api/portal/lease-template?path=${encodeURIComponent(PATH)}`,
      `//evil.example/api/portal/lease-template?path=${encodeURIComponent(PATH)}`,
      `data:text/html,/api/portal/lease-template?path=${encodeURIComponent(PATH)}`,
    ]) {
      expect(leaseTemplateObjectPath(foreign), foreign).toBeNull();
    }
  });

  it("collects nested propertyLeaseTemplates, not just the top-level field", () => {
    const second = `${UID}/1753000000001-ef34gh.pdf`;
    const paths = collectSubmissionLeaseTemplatePaths(
      subWith({
        leaseTemplateDocUrl: leaseTemplateUrlForPath(PATH),
        propertyLeaseTemplates: [
          { leaseTemplateDocUrl: leaseTemplateUrlForPath(second) },
          { leaseTemplateDocUrl: null },
        ] as ManagerListingSubmissionV1["propertyLeaseTemplates"],
      }),
    );
    expect([...paths].sort()).toEqual([PATH, second].sort());
  });
});

describe("deleteSubmissionLeaseTemplates", () => {
  it("skips a path a surviving submission still references", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const shared = leaseTemplateUrlForPath(PATH);
    await deleteSubmissionLeaseTemplates(subWith({ leaseTemplateDocUrl: shared }), [
      subWith({ leaseTemplateDocUrl: shared }),
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reclaims only the paths no survivor references", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const kept = `${UID}/1753000000002-keep00.pdf`;
    await deleteSubmissionLeaseTemplates(
      subWith({
        leaseTemplateDocUrl: leaseTemplateUrlForPath(PATH),
        propertyLeaseTemplates: [
          { leaseTemplateDocUrl: leaseTemplateUrlForPath(kept) },
        ] as ManagerListingSubmissionV1["propertyLeaseTemplates"],
      }),
      [subWith({ leaseTemplateDocUrl: leaseTemplateUrlForPath(kept) })],
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({ paths: [PATH] });
  });

  it("never throws when the cleanup call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      deleteSubmissionLeaseTemplates(subWith({ leaseTemplateDocUrl: leaseTemplateUrlForPath(PATH) })),
    ).resolves.toBeUndefined();
  });
});
