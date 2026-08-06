// @vitest-environment jsdom
//
// Manager "View application" embeds the wizard with templatePreview — it must
// never rewrite the URL to /resident/applications/apply (that route rejects
// managers and bounces them to sign-in).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import type { MockProperty } from "@/data/types";

const routerReplace = vi.fn();
const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const LISTING_ID = "mgr-preview-listing";

function seedListing(): void {
  const sub = createDefaultListingSubmission();
  const property: MockProperty = {
    id: LISTING_ID,
    title: "Preview Flat",
    tagline: "Test",
    address: "1 Test St, Seattle, WA",
    zip: "98101",
    neighborhood: "Test",
    beds: 1,
    baths: 1,
    rentLabel: "$1,200/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Preview Flat",
    unitLabel: "Unit 1",
    adminPublishLive: true,
    managerUserId: "mgr-preview",
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
}

beforeEach(() => {
  routerReplace.mockClear();
  routerPush.mockClear();
  seedListing();
});

afterEach(() => {
  cleanup();
});

describe("RentalApplicationWizard templatePreview", () => {
  it("does not navigate to the resident apply route while previewing", async () => {
    render(
      <RentalApplicationWizard
        showToast={() => {}}
        mode="manager"
        layout="embedded"
        linkedPropertyId={LISTING_ID}
        templatePreview
        onManagerCancel={() => {}}
      />,
    );

    await waitFor(() => {
      expect(routerReplace).not.toHaveBeenCalled();
      expect(routerPush).not.toHaveBeenCalled();
    });
  });
});
