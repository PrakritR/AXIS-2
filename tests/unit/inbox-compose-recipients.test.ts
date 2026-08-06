import { describe, expect, it } from "vitest";
import {
  composeDirectoryCategories,
  isAdminOnlyDirectorySelection,
  mergeAdminComposePersonKey,
} from "@/lib/inbox-compose-recipients";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";

const coManager: InboxScopedContact = {
  id: "rel-1",
  name: "Alex Co",
  email: "alex@example.com",
  role: "manager",
};

const vendor: InboxScopedContact = {
  id: "ven-1",
  name: "Plumber Pro",
  email: "vendor@example.com",
  role: "vendor",
};

const resident: InboxScopedContact = {
  id: "res-1",
  name: "Sam Resident",
  email: "sam@example.com",
  role: "resident",
};

describe("composeDirectoryCategories", () => {
  it("hides Manager and Vendor on manager portal until contacts exist", () => {
    expect(composeDirectoryCategories("manager", [])).toEqual(["resident", "admin"]);
    expect(composeDirectoryCategories("manager", [resident])).toEqual(["resident", "admin"]);
    expect(composeDirectoryCategories("manager", [resident, coManager])).toEqual([
      "resident",
      "management",
      "admin",
    ]);
    expect(composeDirectoryCategories("manager", [resident, coManager, vendor])).toEqual([
      "resident",
      "management",
      "admin",
      "vendor",
    ]);
  });

  it("keeps resident portal management for property managers", () => {
    expect(composeDirectoryCategories("resident", [coManager])).toEqual([
      "resident",
      "management",
      "admin",
    ]);
  });
});

describe("admin compose auto-select", () => {
  it("detects admin-only selection", () => {
    expect(isAdminOnlyDirectorySelection(["admin"])).toBe(true);
    expect(isAdminOnlyDirectorySelection(["admin", "resident"])).toBe(false);
  });

  it("adds and removes admin person key with the To section", () => {
    expect(mergeAdminComposePersonKey(["admin"], [])).toEqual(["admin"]);
    expect(mergeAdminComposePersonKey(["resident"], ["admin"])).toEqual([]);
    expect(mergeAdminComposePersonKey(["admin", "resident"], ["broadcast:resident"])).toEqual([
      "broadcast:resident",
      "admin",
    ]);
  });
});
