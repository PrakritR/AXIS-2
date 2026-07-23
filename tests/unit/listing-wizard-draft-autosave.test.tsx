// @vitest-environment jsdom
//
// Closing the add-listing wizard IS the save — there is no "Save draft" button.
// These tests drive the real `ManagerAddListingForm` through the real
// `saveManagerPropertyDraftToServer` path (only `fetch` and the Supabase
// browser client are stubbed), so they fail if the wizard ever stops calling it
// or starts calling it for an untouched form.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { readAdminPropertyRows } from "@/lib/demo-admin-property-inventory";
import {
  createDefaultListingSubmission,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

// A fresh manager per test — the side-bucket draft store is module-level memory
// that outlives a single test.
let seq = 0;
let MANAGER_ID = "";

vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: MANAGER_ID, ready: true }),
}));

// No session by default: every attachment upload fails, which is what the
// all-attachments-failed tests want. Set `SESSION_USER_ID` to upload for real.
let SESSION_USER_ID: string | null = null;
// Keyed on the blob's content type so a test can fail one attachment and land
// the rest, independent of upload ordering.
let uploadFails: (contentType: string) => boolean = () => false;

// Stubbed one layer below `createSupabaseBrowserClient`: the wizard imports that
// module dynamically once per upload, and concurrent dynamic imports do not all
// resolve to a module-level mock.
vi.mock("@supabase/ssr", () => {
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: SESSION_USER_ID ? { user: { id: SESSION_USER_ID }, access_token: "test-token" } : null,
        },
      }),
    },
    storage: {
      from: () => ({
        remove: async () => ({ data: null, error: null }),
        upload: async (_path: string, _body: unknown, opts?: { contentType?: string }) =>
          uploadFails(opts?.contentType ?? "")
            ? { error: { message: "upload failed" } }
            : { error: null },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  };
  return { createBrowserClient: () => client, createServerClient: () => client };
});

type RecordedCall = { action: string; id: string; status?: string };
let calls: RecordedCall[];

// jsdom implements neither of these; the wizard scrolls its body on every step change.
Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  // "/" reads as the public demo surface, where every server write short-circuits.
  window.history.replaceState(null, "", "/portal/properties");
  window.sessionStorage?.clear();
  MANAGER_ID = `mgr-wizard-autosave-${(seq += 1)}`;
  SESSION_USER_ID = null;
  uploadFails = () => false;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      // `uploadToBucket` reads the bytes of a data URL back through `fetch`.
      if (typeof url === "string" && url.startsWith("data:")) {
        const mime = url.slice("data:".length, url.indexOf(";")) || "application/octet-stream";
        return { ok: true, blob: async () => new Blob(["bytes"], { type: mime }) } as unknown as Response;
      }
      const body = init?.body ? (JSON.parse(init.body) as RecordedCall) : ({} as RecordedCall);
      if (body.action) calls.push({ action: body.action, id: body.id, status: body.status });
      return { ok: true, status: 200, json: async () => ({ records: [] }) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function renderWizard(over: Partial<React.ComponentProps<typeof ManagerAddListingForm>> = {}) {
  const onClose = vi.fn();
  const showToast = vi.fn();
  const view = render(
    <ManagerAddListingForm
      onClose={onClose}
      onSubmitted={vi.fn()}
      showToast={showToast}
      skuTier="pro"
      propCountBeforeSubmit={0}
      {...over}
    />,
  );
  return { onClose, showToast, view };
}

/** Step 0's inputs, addressed by the wizard's own field wrappers. */
function wizardField(name: string): HTMLInputElement {
  const el = document.querySelector(`[data-wizard-field="${name}"] input`);
  if (!el) throw new Error(`no wizard field input for ${name}`);
  return el as HTMLInputElement;
}

/** The wizard's footer Close button, not the header icon or the backdrop. */
function clickClose() {
  const btn = document.querySelector('[data-attr="listing-wizard-close"]');
  if (!btn) throw new Error("no wizard close button");
  fireEvent.click(btn);
}

function typePropertyName(value: string) {
  fireEvent.change(wizardField("buildingName"), { target: { value } });
}

function typeAddress(value: string) {
  fireEvent.change(wizardField("address"), { target: { value } });
}

describe("closing the add-listing wizard saves the work in progress", () => {
  it("persists what the manager entered as a draft, then closes", async () => {
    const { onClose, showToast } = renderWizard();

    typePropertyName("Ravenna Craftsman");
    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const drafts = readAdminPropertyRows(5, MANAGER_ID);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ buildingName: "Ravenna Craftsman", draftStepIndex: 0 });
    // Written as a draft, never as a live/public listing.
    expect(calls).toEqual([{ action: "upsert", id: drafts[0]!.adminRefId, status: "draft" }]);
    expect(readAdminPropertyRows(2, MANAGER_ID)).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/saved to drafts/i));
  });

  it("creates no draft when the wizard was never touched", async () => {
    const { onClose } = renderWizard();

    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(readAdminPropertyRows(5, MANAGER_ID)).toHaveLength(0);
    expect(calls).toEqual([]);
  });

  it("mints a neutral id when closed before a name was typed, then re-keys it on the next close", async () => {
    // First pass: something entered, but no property name yet — the id becomes
    // the permanent public listing URL, so it must not be a blank-name slug.
    const first = renderWizard();
    typeAddress("5200 Ravenna Ave NE");
    clickClose();
    await waitFor(() => expect(first.onClose).toHaveBeenCalled());

    const provisional = readAdminPropertyRows(5, MANAGER_ID)[0]!;
    expect(provisional.adminRefId).toMatch(/^mgr-listing-/);
    expect(provisional.draftIdProvisional).toBe(true);
    cleanup();

    // Resuming through the drafts list keeps the id (`allowIdUpgrade: false`)
    // so the open editor is not unmounted by a changed row key.
    const resumed = renderWizard({
      initialSubmission: provisional.submission,
      editDraftId: provisional.adminRefId,
      initialStepIndex: 0,
      initialMaxStepReached: 0,
    });
    typePropertyName("Ravenna Craftsman");
    clickClose();
    await waitFor(() => expect(resumed.onClose).toHaveBeenCalled());

    const drafts = readAdminPropertyRows(5, MANAGER_ID);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.adminRefId).toBe(provisional.adminRefId);
    expect(drafts[0]!.buildingName).toBe("Ravenna Craftsman");
  });

  it("re-keys a provisional id in the SAME wizard session, writing before deleting", async () => {
    const { onClose } = renderWizard();

    typeAddress("5200 Ravenna Ave NE");
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const provisionalId = readAdminPropertyRows(5, MANAGER_ID)[0]!.adminRefId;

    // The wizard stays mounted (the host closes it), so a second close in the
    // same session updates the draft this wizard minted — and may re-key it.
    typePropertyName("Ravenna Craftsman");
    clickClose();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));

    const drafts = readAdminPropertyRows(5, MANAGER_ID);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.adminRefId).toMatch(/^mgr-ravenna-craftsman-/);
    expect(drafts[0]!.draftIdProvisional).toBeUndefined();
    // Write-before-delete: the re-keyed row lands before the superseded one goes.
    expect(calls.map((c) => `${c.action}:${c.id}`)).toEqual([
      `upsert:${provisionalId}`,
      `upsert:${drafts[0]!.adminRefId}`,
      `delete:${provisionalId}`,
    ]);
  });

  it("keeps the wizard open when the draft write fails, rather than closing on a lie", async () => {
    const { onClose, showToast } = renderWizard();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );

    typePropertyName("Ravenna Craftsman");
    clickClose();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i)));
    expect(onClose).not.toHaveBeenCalled();
    expect(readAdminPropertyRows(5, MANAGER_ID)).toHaveLength(0);
  });

  it("keeps the wizard open when no manager is signed in, rather than dropping the work", async () => {
    // A session that expired mid-wizard must not turn Close into a silent
    // discard — the same keep-open rule as a failed write.
    MANAGER_ID = "";
    const { onClose, showToast } = renderWizard();

    typePropertyName("Ravenna Craftsman");
    clickClose();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i)));
    expect(onClose).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("saves the typed listing without any base64 when the media upload fails", async () => {
    // The stubbed Supabase client has no session, so every data-URL upload
    // fails — the draft must still land, minus the raw bytes.
    const { onClose, showToast } = renderWizard({
      initialSubmission: {
        ...createDefaultListingSubmission(),
        housePhotoDataUrls: ["data:image/jpeg;base64,AAAA"],
        leaseTemplateDocUrl: "data:application/pdf;base64,BBBB",
        floorPlanByLabel: { "Floor 1": "data:image/png;base64,CCCC" },
      },
    });

    typePropertyName("Ravenna Craftsman");
    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const drafts = readAdminPropertyRows(5, MANAGER_ID);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.buildingName).toBe("Ravenna Craftsman");
    expect(JSON.stringify(drafts[0]!.submission)).not.toContain("data:");
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/attachments couldn't be saved/i));
  });

  it("keeps the attachments that uploaded when only one of them fails", async () => {
    // One flaky object must cost that object alone — the siblings already in the
    // bucket keep their URLs instead of being thrown away with it.
    SESSION_USER_ID = "supabase-user-1";
    uploadFails = (contentType) => contentType === "image/png";
    const { onClose, showToast } = renderWizard({
      initialSubmission: {
        ...createDefaultListingSubmission(),
        housePhotoDataUrls: ["data:image/jpeg;base64,AAAA", "data:image/png;base64,BBBB"],
        leaseTemplateDocUrl: "data:application/pdf;base64,CCCC",
      },
    });

    typePropertyName("Ravenna Craftsman");
    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const saved = readAdminPropertyRows(5, MANAGER_ID)[0]!.submission!;
    expect(saved.housePhotoDataUrls).toHaveLength(1);
    expect(saved.housePhotoDataUrls[0]).toMatch(/^https:\/\/storage\.test\//);
    expect(saved.leaseTemplateDocUrl).toMatch(/^https:\/\/storage\.test\//);
    expect(JSON.stringify(saved)).not.toContain("data:");
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/attachments couldn't be saved/i));
  });

  it("reports plain success when every attachment uploads", async () => {
    SESSION_USER_ID = "supabase-user-1";
    const { onClose, showToast } = renderWizard({
      initialSubmission: {
        ...createDefaultListingSubmission(),
        housePhotoDataUrls: ["data:image/jpeg;base64,AAAA", "data:image/png;base64,BBBB"],
      },
    });

    typePropertyName("Ravenna Craftsman");
    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const saved = readAdminPropertyRows(5, MANAGER_ID)[0]!.submission!;
    expect(saved.housePhotoDataUrls).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith("Progress saved to Drafts.");
  });

  it("never drafts an edit of an existing listing", async () => {
    const { onClose } = renderWizard({ editListingId: "mgr-existing-listing" });

    typePropertyName("Renamed Building");
    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(readAdminPropertyRows(5, MANAGER_ID)).toHaveLength(0);
    expect(calls).toEqual([]);
  });
});

describe("submitting the wizard", () => {
  /** Passes every step's validation, so the wizard reaches the upload stage. */
  function validSubmission(): ManagerListingSubmissionV1 {
    const base = createDefaultListingSubmission();
    return {
      ...base,
      buildingName: "Ravenna Craftsman",
      address: "5200 Ravenna Ave NE",
      zip: "98105",
      listingPropertyTypeId: "house",
      listingStoriesId: "two",
      listingTotalBathroomsId: "one",
      listingBedroomSlots: 1,
      listingPlaceCategoryId: "shared_home",
      allowedLeaseTerms: ["12-Month"],
      applicationFee: "0",
      securityDeposit: "0",
      moveInFee: "0",
      parkingMonthly: "0",
      hoaMonthly: "0",
      otherMonthlyFees: "0",
      monthToMonthSurcharge: "0",
      rooms: base.rooms.map((r) => ({ ...r, name: "Room 1", monthlyRent: 1200 })),
      housePhotoDataUrls: ["data:image/jpeg;base64,AAAA", "data:image/png;base64,BBBB"],
    };
  }

  function clickSubmit() {
    const btn = document.querySelector('[data-attr="listing-wizard-submit"]');
    if (!btn) throw new Error("no wizard submit button");
    fireEvent.click(btn);
  }

  it("does not publish a listing whose attachments did not all upload", async () => {
    SESSION_USER_ID = "supabase-user-1";
    uploadFails = (contentType) => contentType === "image/png";
    const onSubmitted = vi.fn();
    const { showToast } = renderWizard({
      initialSubmission: validSubmission(),
      initialStepIndex: 5,
      initialMaxStepReached: 5,
      onSubmitted,
    });

    clickSubmit();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/could not upload photos/i)));
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("publishes when every attachment uploads", async () => {
    SESSION_USER_ID = "supabase-user-1";
    const onSubmitted = vi.fn();
    renderWizard({
      initialSubmission: validSubmission(),
      initialStepIndex: 5,
      initialMaxStepReached: 5,
      onSubmitted,
    });

    clickSubmit();

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(calls.some((c) => c.action === "upsert" && c.status === "live")).toBe(true);
  });
});

describe("resuming a saved draft", () => {
  it("reopens on the step the draft was saved at", () => {
    renderWizard({ initialStepIndex: 2, initialMaxStepReached: 3, editDraftId: "mgr-listing-abc123" });

    // Step 2 of the six-step wizard is Bathrooms.
    expect(screen.getByText(/Step 3 of 6/i)).toBeTruthy();
  });
});
