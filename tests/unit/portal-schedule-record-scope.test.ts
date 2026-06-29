import { describe, expect, it } from "vitest";
import {
  calendarShareAvailabilityStorageKey,
  managerPropertyAvailabilityStorageKey,
} from "@/lib/demo-admin-scheduling";
import {
  expectedManagerScheduleRecordIds,
  isManagerScopedScheduleRecordType,
  managerScheduleRecordIdOwnedByUser,
} from "@/lib/portal-schedule-record-scope";

describe("portal-schedule-record-scope", () => {
  const userId = "user-abc";
  const victimId = "user-victim";
  const propertyId = "prop-1";

  it("recognizes manager-scoped schedule record types", () => {
    expect(isManagerScopedScheduleRecordType("calendar_share_settings")).toBe(true);
    expect(isManagerScopedScheduleRecordType("manager_property_availability")).toBe(true);
    expect(isManagerScopedScheduleRecordType("partner_inquiry_request")).toBe(false);
  });

  it("allows calendar share keys only for the owning manager", () => {
    const ownKey = calendarShareAvailabilityStorageKey(userId, propertyId);
    const victimKey = calendarShareAvailabilityStorageKey(victimId, propertyId);

    expect(managerScheduleRecordIdOwnedByUser(ownKey, userId, "calendar_share_settings")).toBe(true);
    expect(managerScheduleRecordIdOwnedByUser(victimKey, userId, "calendar_share_settings")).toBe(false);
  });

  it("allows property availability keys only for the owning manager", () => {
    const ownKey = managerPropertyAvailabilityStorageKey(userId, propertyId);
    const victimKey = managerPropertyAvailabilityStorageKey(victimId, propertyId);

    expect(managerScheduleRecordIdOwnedByUser(ownKey, userId, "manager_property_availability")).toBe(true);
    expect(managerScheduleRecordIdOwnedByUser(victimKey, userId, "manager_property_availability")).toBe(false);
  });

  it("builds expected share and availability keys for a peer", () => {
    expect(expectedManagerScheduleRecordIds(userId, propertyId)).toEqual({
      shareKey: calendarShareAvailabilityStorageKey(userId, propertyId),
      availKey: managerPropertyAvailabilityStorageKey(userId, propertyId),
    });
  });
});
