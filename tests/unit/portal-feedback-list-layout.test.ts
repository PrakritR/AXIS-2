import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/portal/portal-bug-feedback-panel.tsx"),
  "utf8",
);

describe("feedback list layout", () => {
  it("uses the shared list add row instead of a desktop feedback table", () => {
    expect(source).toContain("<PortalListAddRow");
    expect(source).toContain('label="Add feedback"');
    expect(source).toContain('dataAttr="feedback-add"');
    expect(source).not.toContain("<table");
  });
});
