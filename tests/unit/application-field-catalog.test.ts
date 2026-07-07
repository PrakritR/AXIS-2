import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission, normalizeCustomApplicationFields } from "@/lib/manager-listing-submission";
import {
  patchListingApplicationField,
  removeListingApplicationField,
  resolveListingApplicationFields,
  restoreDefaultApplicationConfig,
  STANDARD_APPLICATION_FIELD_CATALOG,
} from "@/lib/rental-application/application-field-catalog";

describe("application-field-catalog", () => {
  it("materializes the full standard catalog by default", () => {
    const sub = createDefaultListingSubmission();
    const fields = resolveListingApplicationFields(sub, normalizeCustomApplicationFields);
    expect(fields).toHaveLength(STANDARD_APPLICATION_FIELD_CATALOG.length);
    expect(fields.every((f) => f.isStandard)).toBe(true);
  });

  it("hides removed built-in questions", () => {
    const def = STANDARD_APPLICATION_FIELD_CATALOG[0]!;
    const sub = {
      ...createDefaultListingSubmission(),
      disabledStandardApplicationKeys: [def.standardKey],
    };
    const fields = resolveListingApplicationFields(sub, normalizeCustomApplicationFields);
    expect(fields.some((f) => f.standardKey === def.standardKey)).toBe(false);
  });

  it("persists label edits as overrides", () => {
    const def = STANDARD_APPLICATION_FIELD_CATALOG[0]!;
    const sub = createDefaultListingSubmission();
    const [field] = resolveListingApplicationFields(sub, normalizeCustomApplicationFields);
    const next = patchListingApplicationField(sub, field!, { label: "Edited label" });
    const resolved = resolveListingApplicationFields(next, normalizeCustomApplicationFields);
    expect(resolved.find((f) => f.standardKey === def.standardKey)?.label).toBe("Edited label");
  });

  it("restore defaults clears overrides and disabled keys", () => {
    const sub = {
      ...createDefaultListingSubmission(),
      disabledStandardApplicationKeys: [STANDARD_APPLICATION_FIELD_CATALOG[0]!.standardKey],
      customApplicationFields: normalizeCustomApplicationFields([
        { id: "c1", key: "c1", label: "Extra?", type: "text", required: false, options: [] },
      ]),
      applicationConfigMode: "custom" as const,
    };
    const restored = restoreDefaultApplicationConfig();
    const fields = resolveListingApplicationFields(
      { ...sub, ...restored },
      normalizeCustomApplicationFields,
    );
    expect(fields).toHaveLength(STANDARD_APPLICATION_FIELD_CATALOG.length);
    expect(restored.customApplicationFields).toEqual([]);
  });

  it("remove built-in adds disabled key", () => {
    const sub = createDefaultListingSubmission();
    const field = resolveListingApplicationFields(sub, normalizeCustomApplicationFields)[0]!;
    const next = removeListingApplicationField(sub, field);
    expect(next.disabledStandardApplicationKeys).toContain(field.standardKey);
  });
});
