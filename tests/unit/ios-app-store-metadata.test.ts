import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  appendRequiredLegalLinks,
  PROPLANE_PRIVACY_URL,
  repairAppStoreMetadata,
  selectEditableIosVersion,
  STANDARD_APPLE_EULA_URL,
} from "../../scripts/ios-app-store-metadata.mjs";

function version(id: string, state: string, platform = "IOS") {
  return {
    id,
    attributes: { platform, versionString: "1.0", appVersionState: state },
  };
}

describe("App Store legal metadata", () => {
  it("preserves the description and appends both required links exactly once", () => {
    const original = "PropLane helps property managers run leasing and operations.";
    const updated = appendRequiredLegalLinks(original);

    expect(updated.startsWith(original)).toBe(true);
    expect(updated).toContain(`Terms of Use (EULA): ${STANDARD_APPLE_EULA_URL}`);
    expect(updated).toContain(`Privacy Policy: ${PROPLANE_PRIVACY_URL}`);
    expect(appendRequiredLegalLinks(updated)).toBe(updated);
  });

  it("fails before upload if the legal footer would exceed Apple's description limit", () => {
    expect(() => appendRequiredLegalLinks("x".repeat(3999))).toThrow(/Apple allows 4000/);
  });

  it("selects the one editable iOS submission and refuses ambiguous or active-review states", () => {
    expect(
      selectEditableIosVersion([
        version("live", "READY_FOR_DISTRIBUTION"),
        version("rejected", "METADATA_REJECTED"),
        version("mac", "PREPARE_FOR_SUBMISSION", "MAC_OS"),
      ]).id,
    ).toBe("rejected");

    expect(() => selectEditableIosVersion([version("review", "IN_REVIEW")])).toThrow(/No editable/);
    expect(() =>
      selectEditableIosVersion([
        version("one", "REJECTED"),
        version("two", "PREPARE_FOR_SUBMISSION"),
      ]),
    ).toThrow(/refusing to guess/i);
  });

  it("updates every localization and verifies Apple's stored descriptions", async () => {
    const descriptions = new Map([
      ["en", "English description"],
      ["fr", `Description française\n\nTerms of Use (EULA): ${STANDARD_APPLE_EULA_URL}`],
    ]);
    const patches: { id: string; description: string }[] = [];
    const client = {
      get: vi.fn(async (path: string) => {
        if (path.startsWith("apps?")) {
          return { data: [{ id: "6795707576", attributes: { name: "PropLane" } }] };
        }
        if (path.includes("/appStoreVersions?")) {
          return { data: [version("version-1", "METADATA_REJECTED")] };
        }
        if (path.includes("/appStoreVersionLocalizations?")) {
          return {
            data: [
              { id: "en", attributes: { locale: "en-US", description: descriptions.get("en") } },
              { id: "fr", attributes: { locale: "fr-FR", description: descriptions.get("fr") } },
            ],
          };
        }
        const id = path.split("/").at(-1)!;
        return { data: { id, attributes: { description: descriptions.get(id) } } };
      }),
      patch: vi.fn(async (path: string, body: { data: { id: string; attributes: { description: string } } }) => {
        const id = path.split("/").at(-1)!;
        descriptions.set(id, body.data.attributes.description);
        patches.push({ id, description: body.data.attributes.description });
        return { data: body.data };
      }),
    };

    await repairAppStoreMetadata(client as never);

    expect(patches.map((patch) => patch.id).sort()).toEqual(["en", "fr"]);
    for (const description of descriptions.values()) {
      expect(description).toContain(STANDARD_APPLE_EULA_URL);
      expect(description).toContain(PROPLANE_PRIVACY_URL);
    }
  });

  it("keeps metadata repair separate from TestFlight uploads", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/ios-testflight.yml"),
      "utf8",
    );

    expect(workflow).toContain("mode:");
    expect(workflow).toContain("node scripts/ios-app-store-metadata.mjs");
    expect(workflow).toContain("inputs.mode == 'metadata'");
    expect(workflow).toContain("inputs.mode == 'testflight'");
  });
});
