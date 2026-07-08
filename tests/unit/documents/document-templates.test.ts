import { describe, expect, it } from "vitest";
import { applyMergeFields } from "@/lib/documents/document-templates";

describe("applyMergeFields", () => {
  it("replaces merge tokens in template html", () => {
    const html = "<p>Hello {{residentName}}, rent is {{amount}}.</p>";
    expect(applyMergeFields(html, { residentName: "Alex", amount: "$1,200" })).toBe(
      "<p>Hello Alex, rent is $1,200.</p>",
    );
  });
});
