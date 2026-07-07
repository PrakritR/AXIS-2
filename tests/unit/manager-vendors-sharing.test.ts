import { describe, expect, it } from "vitest";
import {
  filterOwnVendorRowsForSync,
  readManagerVendorRows,
  readOwnManagerVendorRows,
  seedDemoManagerVendorRows,
  setManagerVendorActive,
  setManagerVendorPriority,
  writeManagerVendorRows,
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

  it("sets vendor active/inactive and primary priority per trade", () => {
    const a: ManagerVendorRow = { ...own, id: "v-a", name: "Plumber A", vendorPriority: "primary" };
    const b: ManagerVendorRow = { ...own, id: "v-b", name: "Plumber B" };
    writeManagerVendorRows([a, b], "mgr-a");

    setManagerVendorActive("v-b", false, "mgr-a");
    expect(readManagerVendorRows().find((row) => row.id === "v-b")?.active).toBe(false);

    setManagerVendorPriority("v-b", "primary", "mgr-a");
    const rows = readManagerVendorRows();
    expect(rows.find((row) => row.id === "v-b")?.vendorPriority).toBe("primary");
    expect(rows.find((row) => row.id === "v-a")?.vendorPriority).toBeUndefined();

    setManagerVendorPriority("v-b", "secondary", "mgr-a");
    expect(readManagerVendorRows().find((row) => row.id === "v-b")?.vendorPriority).toBe("secondary");
  });
});
