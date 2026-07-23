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

// A fresh manager per test — the side-bucket draft store is module-level memory
// that outlives a single test.
let seq = 0;
let MANAGER_ID = "";

vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: MANAGER_ID, ready: true }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
  }),
}));

type RecordedCall = { action: string; id: string; status?: string };
let calls: RecordedCall[];

// jsdom implements neither of these; the wizard scrolls its body on every step change.
Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

beforeEach(() => {
  // "/" reads as the public demo surface, where every server write short-circuits.
  window.history.replaceState(null, "", "/portal/properties");
  window.sessionStorage?.clear();
  MANAGER_ID = `mgr-wizard-autosave-${(seq += 1)}`;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = init?.body ? (JSON.parse(init.body) as RecordedCall) : ({} as RecordedCall);
      if (body.action) calls.push({ action: body.action, id: body.id, status: body.status });
      return { ok: true, status: 200, json: async () => ({ records: [] }) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it("never drafts an edit of an existing listing", async () => {
    const { onClose } = renderWizard({ editListingId: "mgr-existing-listing" });

    typePropertyName("Renamed Building");
    clickClose();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(readAdminPropertyRows(5, MANAGER_ID)).toHaveLength(0);
    expect(calls).toEqual([]);
  });
});

describe("resuming a saved draft", () => {
  it("reopens on the step the draft was saved at", () => {
    renderWizard({ initialStepIndex: 2, initialMaxStepReached: 3, editDraftId: "mgr-listing-abc123" });

    // Step 2 of the six-step wizard is Bathrooms.
    expect(screen.getByText(/Step 3 of 6/i)).toBeTruthy();
  });
});
