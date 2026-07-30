/**
 * Addendum verification against a running dev server (e.g. localhost:3013).
 */
import { test, expect } from "@playwright/test";
import { signInAsResident } from "../helpers/auth";

test.describe("Tour-resident addendum verification", () => {
  test("req 5: signed-in resident application opens on routed detail page", async ({ page }) => {
    await signInAsResident(page);
    const approvedId = await page.evaluate(async () => {
      const res = await fetch("/api/manager-applications?scope=self", { credentials: "include" });
      const body = (await res.json()) as { rows?: { id: string; bucket: string }[] };
      return (body.rows ?? []).find((row) => row.bucket === "approved")?.id ?? null;
    });
    expect(approvedId).toBeTruthy();

    await page.goto(`/resident/applications/approved/${encodeURIComponent(approvedId!)}`);
    await expect(page.getByText("Application not found.")).not.toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("The Pioneer")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/resident/applications/approved/${approvedId}`));
  });

  test("req 4: resident Communication shows tour/prospect thread after backfill", async ({ page }) => {
    await signInAsResident(page);
    await page.goto("/resident/communication");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/addendum-4 verify|tour request received/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
