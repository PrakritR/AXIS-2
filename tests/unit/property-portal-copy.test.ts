import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIMARY_AXIS_ADMIN_LABEL } from "@/data/inbox-scoped-directory";

describe("property portal copy", () => {
  it("does not expose the primary admin personal email in manager property UI", () => {
    const panelPath = resolve(process.cwd(), "src/components/portal/manager-house-properties-panel.tsx");
    const source = readFileSync(panelPath, "utf8");
    expect(source).not.toContain("prakritramachandran@gmail.com");
    expect(source).toContain("PRIMARY_AXIS_ADMIN_LABEL");
    expect(PRIMARY_AXIS_ADMIN_LABEL).toBe("Axis admin");
  });
});
