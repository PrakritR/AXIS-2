import { describe, expect, it } from "vitest";
import { copyListingPhotosTool } from "@/lib/tools/domains/properties";
import { executeWrite, makeWritableCtx, previewWrite } from "./fake-agent-ctx";

const MANAGER = "manager_a";
const SOURCE_ID = "mgr--9-rooms-b1wf3z";
const TARGET_ID = "mgr-seed-5259-brooklyn-ave-ne";

function propertyRecord(
  id: string,
  opts: {
    buildingName: string;
    housePhotos?: string[];
    roomPhotos?: string[];
    targetRoomPhotos?: string[];
  },
) {
  const submission = {
    v: 1,
    buildingName: opts.buildingName,
    address: `${opts.buildingName}, Seattle, WA`,
    housePhotoDataUrls: opts.housePhotos ?? [],
    rooms: [
      {
        id: "room-1",
        name: "Room 1",
        photoDataUrls: opts.roomPhotos ?? [],
      },
    ],
    bathrooms: [{ id: "bath-1", name: "Bath 1", photoDataUrls: [] }],
    sharedSpaces: [{ id: "shared-1", name: "Kitchen", photoDataUrls: [] }],
  };
  return {
    id,
    manager_user_id: MANAGER,
    status: "live",
    row_data: { submission },
    property_data: {
      buildingName: opts.buildingName,
      listingSubmission: submission,
    },
  };
}

describe("copy_listing_photos tool", () => {
  it("previews copying house and room media between two owned listings", async () => {
    const { ctx } = makeWritableCtx({
      manager_property_records: [
        propertyRecord(SOURCE_ID, {
          buildingName: "5257 Brooklyn Ave NE",
          housePhotos: ["https://example.test/house-1.jpg", "https://example.test/house-2.jpg"],
          roomPhotos: ["https://example.test/room-1.jpg"],
        }),
        propertyRecord(TARGET_ID, {
          buildingName: "5259 Brooklyn Ave NE",
          targetRoomPhotos: [],
        }),
      ],
      audit_log: [],
    });

    const preview = await previewWrite(copyListingPhotosTool, ctx, {
      sourcePropertyId: SOURCE_ID,
      targetPropertyId: TARGET_ID,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.kind).toBe("copy_listing_photos");
    expect(preview.preview.fields).toEqual(
      expect.arrayContaining([
        { label: "From", value: "5257 Brooklyn Ave NE" },
        { label: "To", value: "5259 Brooklyn Ave NE" },
        { label: "House photos", value: "2" },
        { label: "Rooms updated", value: "1" },
      ]),
    );
  });

  it("copies media onto the target without changing status", async () => {
    const { ctx, store } = makeWritableCtx({
      manager_property_records: [
        propertyRecord(SOURCE_ID, {
          buildingName: "5257 Brooklyn Ave NE",
          housePhotos: ["https://example.test/house-1.jpg"],
          roomPhotos: ["https://example.test/room-1.jpg"],
        }),
        propertyRecord(TARGET_ID, {
          buildingName: "5259 Brooklyn Ave NE",
        }),
      ],
      audit_log: [],
    });

    const result = await executeWrite(copyListingPhotosTool, ctx, {
      sourcePropertyId: SOURCE_ID,
      targetPropertyId: TARGET_ID,
    });
    expect(result.ok).toBe(true);

    const target = store.manager_property_records!.find((r) => r.id === TARGET_ID)!;
    expect(target.status).toBe("live");
    const listingSubmission = (target.property_data as { listingSubmission?: { housePhotoDataUrls?: string[]; rooms?: { photoDataUrls?: string[] }[] } })
      .listingSubmission;
    expect(listingSubmission?.housePhotoDataUrls).toEqual(["https://example.test/house-1.jpg"]);
    expect(listingSubmission?.rooms?.[0]?.photoDataUrls).toEqual(["https://example.test/room-1.jpg"]);
  });

  it("refuses when source and target are the same property", async () => {
    const { ctx } = makeWritableCtx({
      manager_property_records: [propertyRecord(SOURCE_ID, { buildingName: "5257 Brooklyn Ave NE" })],
      audit_log: [],
    });
    const preview = await previewWrite(copyListingPhotosTool, ctx, {
      sourcePropertyId: SOURCE_ID,
      targetPropertyId: SOURCE_ID,
    });
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.error).toContain("must be different");
  });
});
