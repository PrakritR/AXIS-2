// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import {
  deleteManagerPropertyDraft,
  publishManagerPropertyDraftToServer,
  readAdminPropertyRows,
  saveManagerPropertyDraftToServer,
} from "@/lib/demo-admin-property-inventory";
import { collectSubmissionMediaPaths, deleteSubmissionMediaObjects } from "@/lib/listing-media-storage";

const storageRemove = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ storage: { from: () => ({ remove: storageRemove }) } }),
}));

/** Calls the drafts route recorded by the fetch mock, in order. */
type RecordedCall = { action: string; id: string; status?: string };

let calls: RecordedCall[];
/** Per-record-id server responses; anything not listed succeeds. */
let failFor: Set<string>;

function mockFetch() {
  return vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as RecordedCall) : ({} as RecordedCall);
    if (body.action) calls.push({ action: body.action, id: body.id, status: body.status });
    const failKey = `${body.action}:${body.id}`;
    const ok = !failFor.has(failKey);
    return { ok, status: ok ? 200 : 500, json: async () => ({ records: [] }) } as unknown as Response;
  });
}

function submission(buildingName: string, photo?: string) {
  return {
    ...createDefaultListingSubmission(),
    buildingName,
    address: "5200 Ravenna Ave NE",
    zip: "98105",
    ...(photo ? { housePhotoDataUrls: [photo] } : {}),
  };
}

const photoUrl = (name: string) =>
  `https://proj.supabase.co/storage/v1/object/public/listing-photos/mgr-1/${name}.jpg`;

let seq = 0;
/** A fresh manager id per test — the side-bucket store is module-level memory. */
const nextManager = () => `mgr-draft-test-${(seq += 1)}`;

beforeEach(() => {
  // "/" counts as the public demo surface, and every server call short-circuits
  // in demo mode — pin the tests to the real signed-in manager portal path.
  window.history.replaceState(null, "", "/portal/properties");
  calls = [];
  failFor = new Set();
  storageRemove.mockClear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mockFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saving an in-progress add-property wizard as a draft", () => {
  it("persists the wizard as a private draft record and lists it under Drafts", async () => {
    const manager = nextManager();
    const id = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager, {
      stepIndex: 1,
      maxStepReached: 1,
    });

    expect(id).toMatch(/^mgr-ravenna-craftsman-/);
    // The listing is written as a draft, never as a live/public record.
    expect(calls).toEqual([{ action: "upsert", id, status: "draft" }]);

    const drafts = readAdminPropertyRows(5, manager);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      adminRefId: id,
      buildingName: "Ravenna Craftsman",
      draftStepIndex: 1,
      draftMaxStepReached: 1,
    });
    // Nothing leaked into the live (bucket 2) or unlisted (bucket 3) stages.
    expect(readAdminPropertyRows(2, manager)).toHaveLength(0);
    expect(readAdminPropertyRows(3, manager)).toHaveLength(0);
  });

  it("keeps the draft out of the list when the server write fails", async () => {
    const manager = nextManager();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );

    expect(await saveManagerPropertyDraftToServer(submission("Never Saved"), manager)).toBeNull();
    expect(readAdminPropertyRows(5, manager)).toHaveLength(0);
  });

  it("re-keys a draft saved before it had a name, writing the new record before deleting the old", async () => {
    const manager = nextManager();
    const provisionalId = await saveManagerPropertyDraftToServer(submission(""), manager, { stepIndex: 0 });
    expect(provisionalId).toMatch(/^mgr-listing-/);
    expect(readAdminPropertyRows(5, manager)[0]?.draftIdProvisional).toBe(true);

    const namedId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager, {
      existingDraftId: provisionalId,
      allowIdUpgrade: true,
    });

    expect(namedId).toMatch(/^mgr-ravenna-craftsman-/);
    // Write-before-delete: the re-keyed row reaches the server before the
    // superseded one is removed, so a failure can never drop the draft.
    expect(calls.map((c) => `${c.action}:${c.id}`)).toEqual([
      `upsert:${provisionalId}`,
      `upsert:${namedId}`,
      `delete:${provisionalId}`,
    ]);
    const drafts = readAdminPropertyRows(5, manager);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.adminRefId).toBe(namedId);
    expect(drafts[0]?.draftIdProvisional).toBeUndefined();
  });

  it("leaves the superseded row visible when its delete fails, rather than losing the draft", async () => {
    const manager = nextManager();
    const provisionalId = await saveManagerPropertyDraftToServer(submission(""), manager);
    failFor.add(`delete:${provisionalId}`);

    const namedId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager, {
      existingDraftId: provisionalId,
      allowIdUpgrade: true,
    });

    const ids = readAdminPropertyRows(5, manager).map((r) => r.adminRefId);
    expect(ids).toContain(namedId);
    expect(ids).toContain(provisionalId);
  });

  it("keeps a resumed draft's id so the open editor is not unmounted", async () => {
    const manager = nextManager();
    const provisionalId = await saveManagerPropertyDraftToServer(submission(""), manager);

    const resavedId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager, {
      existingDraftId: provisionalId,
      allowIdUpgrade: false,
    });

    expect(resavedId).toBe(provisionalId);
    expect(readAdminPropertyRows(5, manager).map((r) => r.adminRefId)).toEqual([provisionalId]);
  });
});

describe("publishing a saved draft", () => {
  it("promotes the same record id draft -> live and empties the drafts bucket", async () => {
    const manager = nextManager();
    const draftId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager);
    calls = [];

    const publishedId = await publishManagerPropertyDraftToServer(draftId!, submission("Ravenna Craftsman"), manager);

    expect(publishedId).toBe(draftId);
    const upserts = calls.filter((c) => c.action === "upsert");
    expect(upserts.length).toBeGreaterThan(0);
    // Same record id, flipped to live — never a second listing row.
    expect(upserts.every((c) => c.id === draftId && c.status === "live")).toBe(true);
    expect(readAdminPropertyRows(5, manager)).toHaveLength(0);
    expect(readAdminPropertyRows(2, manager).map((r) => r.adminRefId)).toEqual([draftId]);
  });

  it("keeps the draft when the publish write fails", async () => {
    const manager = nextManager();
    const draftId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager);
    failFor.add(`upsert:${draftId}`);

    expect(await publishManagerPropertyDraftToServer(draftId!, submission("Ravenna Craftsman"), manager)).toBeNull();
    expect(readAdminPropertyRows(5, manager).map((r) => r.adminRefId)).toEqual([draftId]);
  });
});

describe("deleting a saved draft", () => {
  it("removes the row and reclaims the uploads it owned", async () => {
    const manager = nextManager();
    const only = photoUrl("only-mine");
    const draftId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman", only), manager);

    expect(await deleteManagerPropertyDraft(draftId!, manager)).toBe(true);
    expect(readAdminPropertyRows(5, manager)).toHaveLength(0);
    expect(storageRemove).toHaveBeenCalledWith(["mgr-1/only-mine.jpg"]);
  });

  it("keeps the draft visible when the server delete fails", async () => {
    const manager = nextManager();
    const draftId = await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman"), manager);
    failFor.add(`delete:${draftId}`);

    expect(await deleteManagerPropertyDraft(draftId!, manager)).toBe(false);
    expect(readAdminPropertyRows(5, manager).map((r) => r.adminRefId)).toEqual([draftId]);
  });

  it("does not strip a photo another surviving draft still references", async () => {
    const manager = nextManager();
    const shared = photoUrl("shared");
    // The two rows a partially-failed re-key leaves behind point at the same
    // uploaded object, because the wizard dedupes uploads per data URL.
    const staleId = await saveManagerPropertyDraftToServer(submission("", shared), manager);
    failFor.add(`delete:${staleId}`);
    await saveManagerPropertyDraftToServer(submission("Ravenna Craftsman", shared), manager, {
      existingDraftId: staleId,
      allowIdUpgrade: true,
    });
    failFor.clear();

    expect(await deleteManagerPropertyDraft(staleId!, manager)).toBe(true);
    expect(storageRemove).not.toHaveBeenCalled();
    expect(readAdminPropertyRows(5, manager)).toHaveLength(1);
  });
});

describe("listing media paths", () => {
  it("resolves listing-photos object paths and ignores unuploaded / foreign urls", () => {
    const sub = {
      ...createDefaultListingSubmission(),
      housePhotoDataUrls: [photoUrl("a"), "data:image/png;base64,AAA", "https://example.com/x.jpg"],
      houseVideoDataUrl: photoUrl("clip"),
    };
    expect(collectSubmissionMediaPaths(sub)).toEqual(new Set(["mgr-1/a.jpg", "mgr-1/clip.jpg"]));
  });

  it("never removes an object a surviving submission still uses", async () => {
    const doomed = { ...createDefaultListingSubmission(), housePhotoDataUrls: [photoUrl("keep"), photoUrl("drop")] };
    const survivor = { ...createDefaultListingSubmission(), housePhotoDataUrls: [photoUrl("keep")] };

    await deleteSubmissionMediaObjects(doomed, [survivor]);

    expect(storageRemove).toHaveBeenCalledWith(["mgr-1/drop.jpg"]);
  });
});
