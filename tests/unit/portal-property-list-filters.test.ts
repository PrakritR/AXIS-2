import { describe, expect, it } from "vitest";
import {
  appendPortalPropertyFilterQuery,
  parsePortalPropertyFilterQuery,
  sanitizePortalPropertyFilterIds,
} from "@/lib/portal-property-list-filters";

describe("portal-property-list-filters", () => {
  it("parses comma-separated property ids from the query string", () => {
    expect(parsePortalPropertyFilterQuery("?properties=prop-1,prop-2")).toEqual(["prop-1", "prop-2"]);
    expect(parsePortalPropertyFilterQuery(new URLSearchParams("properties=prop-1"))).toEqual(["prop-1"]);
    expect(parsePortalPropertyFilterQuery("")).toEqual([]);
  });

  it("appends property filters to list hrefs", () => {
    expect(appendPortalPropertyFilterQuery("/portal/applications/pending", ["a", "b"])).toBe(
      "/portal/applications/pending?properties=a%2Cb",
    );
    expect(appendPortalPropertyFilterQuery("/portal/applications/pending?open=1", [])).toBe(
      "/portal/applications/pending",
    );
  });

  it("drops unknown property ids", () => {
    expect(sanitizePortalPropertyFilterIds(["a", "b"], ["a"])).toEqual(["a"]);
  });
});
