import { describe, expect, it } from "vitest";
import { pickVisibleActions } from "@/components/portal/portal-adaptive-header-actions";

describe("pickVisibleActions", () => {
  const actions = [
    { id: "filter", node: null, menuItem: null, keepPriority: 1 },
    { id: "add", node: null, menuItem: null, keepPriority: 2 },
  ];

  it("keeps display order when everything fits", () => {
    expect(pickVisibleActions(actions, 2).map((action) => action.id)).toEqual(["filter", "add"]);
  });

  it("prefers higher keepPriority when only one action fits", () => {
    expect(pickVisibleActions(actions, 1).map((action) => action.id)).toEqual(["add"]);
  });
});
