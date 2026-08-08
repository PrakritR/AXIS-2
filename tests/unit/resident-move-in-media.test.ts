import { describe, expect, it } from "vitest";
import { resolveResidentMoveInFromApplications } from "@/lib/resident-move-in-resolve";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { MockProperty } from "@/data/types";

describe("resolveResidentMoveInFromApplications media", () => {
  it("returns per-room move-in photos and video for placed residents", () => {
    const applications: DemoApplicantRow[] = [
      {
        id: "app-1",
        bucket: "approved",
        email: "resident@example.com",
        propertyId: "mgr-4709a",
        assignedPropertyId: "mgr-4709a",
        assignedRoomChoice: "mgr-4709a::seed-4709a-room-2",
        property: "4709A 8th Ave NE",
        application: { roomChoice1: "mgr-4709a::seed-4709a-room-2", propertyId: "mgr-4709a" },
      } as DemoApplicantRow,
    ];

    const properties: Record<string, MockProperty | undefined> = {
      "mgr-4709a": {
        id: "mgr-4709a",
        title: "4709A 8th Ave NE",
        buildingName: "4709A 8th Ave NE",
        address: "4709A 8th Ave NE, Seattle, WA",
        listingSubmission: {
          v: 1,
          buildingName: "4709A 8th Ave NE",
          address: "4709A 8th Ave NE, Seattle, WA",
          zip: "98115",
          neighborhood: "",
          tagline: "",
          petFriendly: false,
          houseOverview: "",
          houseRulesText: "",
          housePhotoDataUrls: [],
          leaseTermsBody: "",
          applicationFee: "0",
          securityDeposit: "0",
          moveInFee: "0",
          paymentAtSigningIncludes: [],
          houseCostsDetail: "",
          parkingMonthly: "0",
          hoaMonthly: "0",
          otherMonthlyFees: "0",
          quickFacts: [],
          bundles: [],
          sharedSpaces: [],
          bathrooms: [],
          rooms: [
            {
              id: "seed-4709a-room-2",
              name: "Room 2",
              floor: "Second Floor",
              monthlyRent: 775,
              availability: "Available now",
              moveInAvailableDate: "2026-09-01",
              moveInInstructions: "Front door code 001000",
              moveInPhotoDataUrls: ["https://cdn.example/move-in-1.jpg"],
              moveInVideoDataUrl: "https://cdn.example/move-in.mp4",
              manualUnavailableRanges: [],
              detail: "",
              furnishing: "",
              roomAmenitiesText: "",
              photoDataUrls: [],
              videoDataUrl: null,
              utilitiesEstimate: "",
            },
          ],
        },
      } as unknown as MockProperty,
    };

    const resolved = resolveResidentMoveInFromApplications("resident@example.com", applications, properties);
    expect(resolved?.instructions).toBe("Front door code 001000");
    expect(resolved?.moveInPhotoDataUrls).toEqual(["https://cdn.example/move-in-1.jpg"]);
    expect(resolved?.moveInVideoDataUrl).toBe("https://cdn.example/move-in.mp4");
  });
});
