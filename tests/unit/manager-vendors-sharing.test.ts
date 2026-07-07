import { describe, expect, it } from "vitest";
import {
  filterOwnVendorRowsForSync,
  readOwnManagerVendorRows,
  type ManagerVendorRow,
} from "@/lib/manager-vendors-storage";

const own: ManagerVendorRow = {
  id: "v-own",
  managerUserId: "mgr-a",
  name: "Own Vendor",
  trade: "Plumbing",
  phone: "",
  email: "",
  notes: "",
  active: true,
};

const sharedFromOther: ManagerVendorRow = {
  id: "v-shared",
  managerUserId: "mgr-b",
  name: "Shared Vendor",
  trade: "HVAC",
  phone: "",
  email: "",
  notes: "",
  active: true,
  sharedWithManagers: true,
};

describe("manager vendor sharing sync", () => {
  it("only syncs rows owned by the current manager", () => {
    const rows = [own, sharedFromOther];
    expect(filterOwnVendorRowsForSync(rows, "mgr-a")).toEqual([own]);
    expect(filterOwnVendorRowsForSync(rows, "mgr-b")).toEqual([sharedFromOther]);
  });

  it("includes legacy rows without managerUserId for the syncing manager", () => {
    const legacy: ManagerVendorRow = { ...own, id: "v-legacy", managerUserId: null };
    expect(filterOwnVendorRowsForSync([legacy, sharedFromOther], "mgr-a")).toEqual([legacy]);
  });

  it("readOwnManagerVendorRows keeps legacy own vendors visible", () => {
    const legacy: ManagerVendorRow = { ...own, id: "v-legacy", managerUserId: null };
    const rows = readOwnManagerVendorRows("mgr-a", [legacy, sharedFromOther]);
    expect(rows).toEqual([legacy]);
  });
});
