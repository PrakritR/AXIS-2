// @vitest-environment jsdom
//
// PUBLIC apply flow — draft resume after a real page reload. The in-memory
// wizard draft dies on reload, so the wizard's public resume effect restores
// the in-progress application from the server: a guest presents the axis id +
// freshest resident-setup token kept in sessionStorage (capability read via
// POST /api/portal/application-resume); a signed-in user falls back to the
// email-scoped GET ?scope=self. Only the axis id and token ever touch disk.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  clearRentalWizardDraft,
  loadRentalWizardDraft,
  loadRentalWizardDraftAxisId,
} from "@/lib/rental-application/drafts";
import type { MockProperty } from "@/data/types";

const PID = "mgr-resume-flat";
const AXIS_ID = "PROPLANE-RESUME01";
const TOKEN = "guest-resume-token-123";

let searchParams = new URLSearchParams({ propertyId: PID });

vi.mock("next/navigation", () => ({
  usePathname: () => "/rent/apply",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";

function seedListing(): void {
  const sub = createDefaultListingSubmission();
  const property: MockProperty = {
    id: PID,
    title: "Resume Flat",
    tagline: "Test",
    address: "1 Resume St, Seattle, WA",
    zip: "98101",
    neighborhood: "Test",
    beds: 1,
    baths: 1,
    rentLabel: "$1,200/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Resume Flat",
    unitLabel: "Unit 1",
    adminPublishLive: true,
    managerUserId: "mgr-resume-owner",
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
}

function serverRow(): DemoApplicantRow {
  return {
    id: AXIS_ID,
    name: "Riley Guest",
    email: "riley.guest@example.com",
    property: "Resume Flat",
    propertyId: PID,
    stage: "In progress",
    bucket: "pending",
    detail: "Started",
    application: {
      propertyId: PID,
      email: "riley.guest@example.com",
      fullLegalName: "Riley Guest",
      wizardStep: 4,
      wizardMaxStepReached: 4,
    } as DemoApplicantRow["application"],
  };
}

const fetchCalls: { url: string; body: string | null }[] = [];

function stubFetch(handlers: { resumeStatus?: number; resumeRow?: DemoApplicantRow | null; selfRows?: DemoApplicantRow[] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, body: typeof init?.body === "string" ? init.body : null });
      if (url.includes("/api/portal/application-resume")) {
        const status = handlers.resumeStatus ?? (handlers.resumeRow ? 200 : 403);
        return new Response(
          JSON.stringify(handlers.resumeRow ? { row: handlers.resumeRow } : { error: "Not allowed." }),
          { status },
        );
      }
      if (url.includes("/api/manager-applications") && !init?.method) {
        return new Response(JSON.stringify({ rows: handlers.selfRows ?? [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, rows: [] }), { status: 200 });
    }),
  );
}

async function mountWizard() {
  await act(async () => {
    render(<RentalApplicationWizard showToast={() => {}} mode="public" exitPath="/rent/browse" />);
  });
  // Let the async resume reads resolve and their state updates flush.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  // jsdom defaults to "/", which `isDemoModeActive()` treats as the public demo
  // surface — the real apply page lives at /rent/apply.
  window.history.replaceState(null, "", `/rent/apply?propertyId=${PID}`);
  seedListing();
  searchParams = new URLSearchParams({ propertyId: PID });
  fetchCalls.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearRentalWizardDraft();
  window.sessionStorage.clear();
});

describe("public apply — resume after reload", () => {
  it("restores a guest's in-progress draft via the axis id + setup token kept in sessionStorage", async () => {
    // What a pre-reload session left behind: ONLY the id and the token.
    window.sessionStorage.setItem("axis:rental-application:public-resume-axis-id:v1", AXIS_ID);
    window.sessionStorage.setItem(`axis.applicationSetupToken.${AXIS_ID}`, TOKEN);
    stubFetch({ resumeRow: serverRow() });

    await mountWizard();

    const resumeCall = fetchCalls.find((c) => c.url.includes("/api/portal/application-resume"));
    expect(resumeCall).toBeDefined();
    expect(JSON.parse(resumeCall!.body ?? "{}")).toEqual({ id: AXIS_ID, token: TOKEN });

    expect(loadRentalWizardDraftAxisId()).toBe(AXIS_ID);
    const draft = loadRentalWizardDraft();
    expect(draft?.fullLegalName).toBe("Riley Guest");
    expect(draft?.email).toBe("riley.guest@example.com");
    expect(draft?.propertyId).toBe(PID);
  });

  it("falls back to the signed-in email-scoped read (?scope=self) when no guest token is stored", async () => {
    stubFetch({ selfRows: [serverRow()] });

    await mountWizard();

    expect(fetchCalls.some((c) => c.url.includes("/api/portal/application-resume"))).toBe(false);
    expect(fetchCalls.some((c) => c.url.includes("/api/manager-applications?scope=self"))).toBe(true);
    expect(loadRentalWizardDraftAxisId()).toBe(AXIS_ID);
    expect(loadRentalWizardDraft()?.fullLegalName).toBe("Riley Guest");
  });

  it("never restores a draft for a DIFFERENT property than the one this request targets", async () => {
    window.sessionStorage.setItem("axis:rental-application:public-resume-axis-id:v1", AXIS_ID);
    window.sessionStorage.setItem(`axis.applicationSetupToken.${AXIS_ID}`, TOKEN);
    const foreign = serverRow();
    foreign.propertyId = "mgr-some-other-listing";
    (foreign.application as { propertyId?: string }).propertyId = "mgr-some-other-listing";
    stubFetch({ resumeRow: foreign });

    await mountWizard();

    expect(loadRentalWizardDraftAxisId()).toBeNull();
    expect(loadRentalWizardDraft()?.fullLegalName ?? "").not.toBe("Riley Guest");
  });

  it("restores nothing when both reads come back empty (a genuinely fresh application)", async () => {
    stubFetch({ selfRows: [] });

    await mountWizard();

    expect(loadRentalWizardDraftAxisId()).toBeNull();
  });
});
