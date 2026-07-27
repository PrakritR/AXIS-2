import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applicationPhotoFolderKey,
  buildApplicationPhotoPath,
  canActorAccessApplicationPhoto,
  isPathInApplicationFolder,
  parseApplicationPhotoDataUrl,
  reclaimApplicationPhotos,
  type ApplicationPhotoActor,
  type StoredApplicationOwnership,
} from "@/lib/rental-application/application-photos.server";

/**
 * The security-critical boundary for applicant ID / income photos: only the
 * applicant and the manager who received that application may reach the bytes.
 * `canActorAccessApplicationPhoto` is the single decision the read route makes
 * (after resolving actor + application from the session/DB), so proving it here
 * proves the boundary without a live database — the same shape as the
 * waiver-code isolation test.
 */

// Manager A owns `propA`; the application was submitted to `propA`.
const appForManagerA: StoredApplicationOwnership = {
  managerUserId: "mgr_A",
  propertyId: "propA",
  assignedPropertyId: null,
  residentEmail: "applicant@example.com",
};

const managerA: ApplicationPhotoActor = {
  kind: "manager",
  userId: "mgr_A",
  accessiblePropertyIds: new Set(["propA"]),
};

// Manager B owns only `propB` and is not attributed to the application.
const managerB: ApplicationPhotoActor = {
  kind: "manager",
  userId: "mgr_B",
  accessiblePropertyIds: new Set(["propB"]),
};

describe("canActorAccessApplicationPhoto — cross-manager isolation", () => {
  it("lets the owning manager view the photo (attribution AND property both match)", () => {
    expect(canActorAccessApplicationPhoto(managerA, appForManagerA)).toBe(true);
  });

  it("DENIES a different manager access to another manager's applicant's photo", () => {
    // mgr_B has no grant on propA and is not the attributed manager — the exact
    // boundary the task requires a test for. Must be false, no matter the URL.
    expect(canActorAccessApplicationPhoto(managerB, appForManagerA)).toBe(false);
  });

  it("still lets the CURRENT property owner in when attribution is stale (property transfer)", () => {
    // Attributed to mgr_A, but the property now belongs to mgr_B. Property
    // access is the source of truth (mirrors fetchApplicationsForManagerUser).
    const transferred: ApplicationPhotoActor = {
      kind: "manager",
      userId: "mgr_B",
      accessiblePropertyIds: new Set(["propA"]),
    };
    expect(canActorAccessApplicationPhoto(transferred, appForManagerA)).toBe(true);
  });

  it("lets the attributed manager in even after they no longer own the property", () => {
    const attributedOnly: ApplicationPhotoActor = {
      kind: "manager",
      userId: "mgr_A",
      accessiblePropertyIds: new Set(), // owns nothing now
    };
    expect(canActorAccessApplicationPhoto(attributedOnly, appForManagerA)).toBe(true);
  });

  it("matches on the assigned property id too", () => {
    const assignedElsewhere: StoredApplicationOwnership = {
      managerUserId: "mgr_A",
      propertyId: null,
      assignedPropertyId: "propAssigned",
      residentEmail: "applicant@example.com",
    };
    const withAssigned: ApplicationPhotoActor = {
      kind: "manager",
      userId: "mgr_B",
      accessiblePropertyIds: new Set(["propAssigned"]),
    };
    expect(canActorAccessApplicationPhoto(withAssigned, assignedElsewhere)).toBe(true);
  });
});

describe("canActorAccessApplicationPhoto — applicant + admin", () => {
  it("lets the applicant view their own photo (email matches, case-insensitive)", () => {
    const resident: ApplicationPhotoActor = { kind: "resident", email: "Applicant@Example.com" };
    expect(canActorAccessApplicationPhoto(resident, appForManagerA)).toBe(true);
  });

  it("DENIES a resident whose email does not match the application", () => {
    const other: ApplicationPhotoActor = { kind: "resident", email: "someone-else@example.com" };
    expect(canActorAccessApplicationPhoto(other, appForManagerA)).toBe(false);
  });

  it("DENIES a guest with a mismatched claimed email", () => {
    const guest: ApplicationPhotoActor = { kind: "guest", email: "attacker@example.com" };
    expect(canActorAccessApplicationPhoto(guest, appForManagerA)).toBe(false);
  });

  it("never matches an application that has no applicant email", () => {
    const resident: ApplicationPhotoActor = { kind: "resident", email: "" };
    const noEmailApp: StoredApplicationOwnership = { ...appForManagerA, residentEmail: null };
    expect(canActorAccessApplicationPhoto(resident, noEmailApp)).toBe(false);
  });

  it("lets an admin view any application's photo", () => {
    expect(canActorAccessApplicationPhoto({ kind: "admin" }, appForManagerA)).toBe(true);
  });
});

describe("path containment + upload validation", () => {
  it("builds an unguessable path inside the application's own folder", () => {
    const path = buildApplicationPhotoPath("PROPLANE-ABC123", "idFront", "jpg");
    expect(isPathInApplicationFolder(path, "PROPLANE-ABC123")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
    // Two builds never collide.
    expect(buildApplicationPhotoPath("PROPLANE-ABC123", "idFront", "jpg")).not.toBe(path);
  });

  it("rejects a stored path that does not belong to the named application (no traversal)", () => {
    const otherPath = buildApplicationPhotoPath("PROPLANE-OTHER", "idFront", "jpg");
    expect(isPathInApplicationFolder(otherPath, "PROPLANE-ABC123")).toBe(false);
    expect(isPathInApplicationFolder("application/../secrets/x.jpg", "PROPLANE-ABC123")).toBe(false);
  });

  it("enforces the MIME allowlist per slot (ID photos are images only)", () => {
    const pdfHeader = "data:application/pdf;base64,JVBERi0=";
    // Allowed for income proof …
    expect(parseApplicationPhotoDataUrl(pdfHeader, "income").ok).toBe(true);
    // … but not for an ID photo slot.
    const idResult = parseApplicationPhotoDataUrl(pdfHeader, "idFront");
    expect(idResult.ok).toBe(false);
  });

  it("rejects a disallowed MIME type", () => {
    const svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    expect(parseApplicationPhotoDataUrl(svg, "idFront").ok).toBe(false);
  });

  it("rejects a non-data-url", () => {
    expect(parseApplicationPhotoDataUrl("https://evil/x.jpg", "idFront").ok).toBe(false);
    expect(parseApplicationPhotoDataUrl(null, "idFront").ok).toBe(false);
  });

  it("accepts a small valid JPEG data url", () => {
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`;
    const result = parseApplicationPhotoDataUrl(jpeg, "idFront");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/jpeg");
      expect(result.ext).toBe("jpg");
    }
  });
});

/**
 * Retention is Option A (captain): photos live only as long as the application
 * row, and deleting the application is the ONLY thing that removes them — so a
 * delete MUST take the real storage bytes, not just the DB row, or ID photos of
 * rejected applicants accumulate forever with nothing pointing at them. This
 * proves the reclaim removes exactly the application's own objects and never
 * another application's folder.
 */
describe("reclaimApplicationPhotos — an application delete removes the bytes", () => {
  function makeFakeStorage(filesByFolder: Record<string, string[]>) {
    const listedFolders: string[] = [];
    const removedPaths: string[] = [];
    const db = {
      storage: {
        from() {
          return {
            async list(folder: string) {
              listedFolders.push(folder);
              const names = filesByFolder[folder] ?? [];
              return { data: names.map((name) => ({ name })), error: null };
            },
            async remove(paths: string[]) {
              removedPaths.push(...paths);
              return { data: null, error: null };
            },
          };
        },
      },
    } as unknown as SupabaseClient;
    return { db, listedFolders, removedPaths };
  }

  it("removes every object under the application's own folder", async () => {
    const appId = "PROPLANE-ABC123";
    const folder = `application/${applicationPhotoFolderKey(appId)}`;
    const { db, listedFolders, removedPaths } = makeFakeStorage({
      [folder]: ["idFront-1-uuid.jpg", "idBack-2-uuid.jpg", "income-3-uuid.pdf"],
      "application/PROPLANE-OTHER": ["idFront-9-uuid.jpg"], // a different applicant's photos
    });

    await reclaimApplicationPhotos(db, appId);

    expect(listedFolders).toContain(folder);
    expect(removedPaths).toEqual([
      `${folder}/idFront-1-uuid.jpg`,
      `${folder}/idBack-2-uuid.jpg`,
      `${folder}/income-3-uuid.pdf`,
    ]);
    // Never touches another application's folder.
    expect(removedPaths.every((p) => p.startsWith(`${folder}/`))).toBe(true);
    expect(removedPaths.some((p) => p.includes("PROPLANE-OTHER"))).toBe(false);
  });

  it("no-ops cleanly when the application has no photos", async () => {
    const { db, removedPaths } = makeFakeStorage({});
    await reclaimApplicationPhotos(db, "PROPLANE-EMPTY");
    expect(removedPaths).toEqual([]);
  });
});
