import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROCESSING_TIMEOUT_SECONDS,
  MAX_PROCESSING_TIMEOUT_SECONDS,
  normalizeGroupName,
  parseTimeoutSeconds,
  selectBetaGroup,
  tokenIsUsable,
} from "../../scripts/ios-testflight-distribute.mjs";

const repoRoot = path.resolve(__dirname, "../..");
const readRepoFile = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");

const group = (name: string, isInternalGroup: boolean, id = name) => ({
  id,
  attributes: { name, isInternalGroup },
});

const INTERNAL_GROUP = "Internal — PropLane team";

describe("selectBetaGroup", () => {
  it("matches the internal group by exact name", () => {
    const groups = [group("Public beta", false), group(INTERNAL_GROUP, true, "grp-1")];
    expect(selectBetaGroup(groups, INTERNAL_GROUP).id).toBe("grp-1");
  });

  it("tolerates surrounding whitespace and Unicode normalization, not different names", () => {
    const groups = [group(`  ${INTERNAL_GROUP}  `, true, "grp-1")];
    expect(selectBetaGroup(groups, INTERNAL_GROUP).id).toBe("grp-1");

    // A hyphen is not an em dash — this must not fuzzy-match.
    expect(() => selectBetaGroup([group("Internal - PropLane team", true)], INTERNAL_GROUP)).toThrow(
      /No TestFlight beta group named/,
    );
  });

  it("fails loudly instead of falling back to another internal group", () => {
    const groups = [group("Internal testers", true), group("Team", true)];
    expect(() => selectBetaGroup(groups, INTERNAL_GROUP)).toThrow(/No TestFlight beta group named/);
    // The error lists what does exist so the fix is obvious from CI logs alone.
    expect(() => selectBetaGroup(groups, INTERNAL_GROUP)).toThrow(/Internal testers/);
  });

  it("refuses an external group even on an exact name match", () => {
    const groups = [group(INTERNAL_GROUP, false)];
    expect(() => selectBetaGroup(groups, INTERNAL_GROUP)).toThrow(/EXTERNAL group/);
  });

  it("fails on an empty group list rather than treating it as nothing to do", () => {
    expect(() => selectBetaGroup([], INTERNAL_GROUP)).toThrow(/No TestFlight beta group named/);
  });
});

describe("normalizeGroupName", () => {
  it("is total over nullish input", () => {
    expect(normalizeGroupName(undefined)).toBe("");
    expect(normalizeGroupName(null)).toBe("");
  });
});

describe("tokenIsUsable", () => {
  const now = 1_700_000_000;

  it("keeps a token that outlives the refresh margin", () => {
    expect(tokenIsUsable(now + 20 * 60, now)).toBe(true);
  });

  it("re-mints before expiry rather than sending a token that dies in flight", () => {
    // A processing wait longer than the 20-minute token life used to 401 the
    // assign + verify calls and leave the build undistributed.
    expect(tokenIsUsable(now + 120, now)).toBe(false);
    expect(tokenIsUsable(now - 1, now)).toBe(false);
    expect(tokenIsUsable(undefined, now)).toBe(false);
  });
});

describe("parseTimeoutSeconds", () => {
  it("defaults when unset or blank", () => {
    expect(parseTimeoutSeconds(undefined)).toBe(DEFAULT_PROCESSING_TIMEOUT_SECONDS);
    expect(parseTimeoutSeconds("")).toBe(DEFAULT_PROCESSING_TIMEOUT_SECONDS);
    expect(parseTimeoutSeconds("   ")).toBe(DEFAULT_PROCESSING_TIMEOUT_SECONDS);
  });

  it("accepts a positive number", () => {
    expect(parseTimeoutSeconds("600")).toBe(600);
    expect(parseTimeoutSeconds(" 900 ")).toBe(900);
  });

  it("rejects a non-numeric value instead of polling forever on NaN", () => {
    // Number("abc") -> NaN makes `Date.now() >= deadline` never true, so the
    // wait would run until the workflow step cap killed the job with no
    // diagnostic — replacing the timeout message and its --build= hint.
    expect(() => parseTimeoutSeconds("abc")).toThrow(/positive number of seconds/);
    expect(() => parseTimeoutSeconds("0")).toThrow(/positive number of seconds/);
    expect(() => parseTimeoutSeconds("-30")).toThrow(/positive number of seconds/);
  });

  it("rejects a value that would outlive the workflow step cap", () => {
    expect(() => parseTimeoutSeconds(String(MAX_PROCESSING_TIMEOUT_SECONDS + 1))).toThrow(
      /exceeds the .* the workflow step allows/,
    );
    expect(parseTimeoutSeconds(String(MAX_PROCESSING_TIMEOUT_SECONDS))).toBe(MAX_PROCESSING_TIMEOUT_SECONDS);
  });
});

describe("iOS TestFlight pipeline wiring", () => {
  // A build that uploads but is never assigned to a tester group is invisible to
  // testers while CI stays green — the exact failure these assertions prevent.
  it("runs the distribute step after the fastlane upload and threads the build number", () => {
    const workflow = readRepoFile(".github/workflows/ios-testflight.yml");
    expect(workflow).toContain("node scripts/ios-testflight-distribute.mjs");
    expect(workflow).toContain("TESTFLIGHT_BUILD_NUMBER: ${{ steps.upload.outputs.build_number }}");
    expect(workflow.indexOf("id: upload")).toBeLessThan(
      workflow.indexOf("node scripts/ios-testflight-distribute.mjs"),
    );
  });

  it("keeps the fastlane lane emitting the build number and never distributes externally", () => {
    const fastfile = readRepoFile("ios/App/fastlane/Fastfile");
    expect(fastfile).toContain('File.open(github_output, "a")');
    expect(fastfile).toContain("build_number=#{next_build}");
    expect(fastfile).toContain("distribute_external: false");
  });

  it("declares export compliance in Info.plist so a build is never stuck on it", () => {
    const plist = readRepoFile("ios/App/App/Info.plist");
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });

  it("pins the canonical app record so the legacy record can never receive a build", () => {
    const script = readRepoFile("scripts/ios-testflight-distribute.mjs");
    expect(script).toContain('DEFAULT_APP_ID = "6795707576"');
    expect(script).toContain('DEFAULT_BUNDLE_ID = "space.proplane.app"');
  });
});
