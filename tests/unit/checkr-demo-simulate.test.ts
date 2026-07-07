import { describe, expect, it } from "vitest";
import { demoApplications } from "@/lib/demo/demo-data";
import { buildDemoBackgroundCheck } from "@/lib/checkr/demo-simulate";

describe("checkr demo simulate", () => {
  it("seeds showcase applicants with completed background checks", () => {
    const apps = demoApplications();
    const jordan = apps.find((row) => row.id === "demo-app-4");
    const priya = apps.find((row) => row.id === "demo-app-1");
    const sofia = apps.find((row) => row.id === "demo-app-3");

    expect(jordan?.backgroundCheck?.status).toBe("complete");
    expect(jordan?.backgroundCheck?.result).toBe("clear");
    expect(priya?.backgroundCheck).toBeUndefined();
    expect(sofia?.backgroundCheck?.status).toBe("complete");
    expect(sofia?.backgroundCheck?.result).toBe("consider");
  });

  it("derives consider from odd final SSN digit", () => {
    const row = demoApplications().find((r) => r.id === "demo-app-3")!;
    const bg = buildDemoBackgroundCheck(row);
    expect(bg.result).toBe("consider");
  });

  it("derives clear from even final SSN digit", () => {
    const row = demoApplications().find((r) => r.id === "demo-app-2")!;
    const bg = buildDemoBackgroundCheck(row);
    expect(bg.result).toBe("clear");
  });
});
