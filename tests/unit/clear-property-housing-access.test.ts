import { describe, expect, it } from "vitest";

// Pure helpers mirrored from clear-property-housing-access for unit coverage of scrubbing.
function scrubHousingFromRowData(rowData: unknown): Record<string, unknown> {
  const row =
    rowData && typeof rowData === "object" ? { ...(rowData as Record<string, unknown>) } : {};
  row.property = "";
  row.propertyId = "";
  row.assignedPropertyId = "";
  row.assignedRoomChoice = "";
  row.stage = "Moved out";
  if (row.manualResidentDetails && typeof row.manualResidentDetails === "object") {
    row.manualResidentDetails = {
      ...(row.manualResidentDetails as Record<string, unknown>),
      roomNumber: "",
      moveInDate: "",
      moveOutDate: new Date().toISOString().slice(0, 10),
    };
  } else {
    row.manualResidentDetails = {
      roomNumber: "",
      moveInDate: "",
      moveOutDate: new Date().toISOString().slice(0, 10),
    };
  }
  if (row.application && typeof row.application === "object") {
    row.application = {
      ...(row.application as Record<string, unknown>),
      propertyId: "",
    };
  }
  return row;
}

describe("clear property housing scrubbing", () => {
  it("clears property/room/dates and marks the resident moved out", () => {
    const scrubbed = scrubHousingFromRowData({
      property: "5259 Brooklyn Ave NE · 9 rooms",
      propertyId: "brooklyn",
      assignedPropertyId: "brooklyn",
      assignedRoomChoice: "Room 3",
      stage: "Approved",
      manualResidentDetails: {
        roomNumber: "Room 3",
        moveInDate: "2026-01-01",
        moveOutDate: "",
      },
      application: { propertyId: "brooklyn" },
    });

    expect(scrubbed.property).toBe("");
    expect(scrubbed.propertyId).toBe("");
    expect(scrubbed.assignedPropertyId).toBe("");
    expect(scrubbed.assignedRoomChoice).toBe("");
    expect(scrubbed.stage).toBe("Moved out");
    expect((scrubbed.manualResidentDetails as { roomNumber?: string }).roomNumber).toBe("");
    expect((scrubbed.manualResidentDetails as { moveInDate?: string }).moveInDate).toBe("");
    expect((scrubbed.manualResidentDetails as { moveOutDate?: string }).moveOutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((scrubbed.application as { propertyId?: string }).propertyId).toBe("");
  });
});
