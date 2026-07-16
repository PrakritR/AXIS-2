import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ENV_KEYS = [
  "CHECKR_API_KEY",
  "CHECKR_SAMPLE_ORDER_ID",
  "CHECKR_SAMPLE_REPORT_RESOURCE_ID",
] as const;

describe("checkr sample report pdf", () => {
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    vi.resetModules();
  });

  it("sanitizeCheckrReportApplicationId strips unsafe filename characters", async () => {
    const { sanitizeCheckrReportApplicationId } = await import("@/lib/checkr/sample-report-pdf");
    expect(sanitizeCheckrReportApplicationId("app-123_demo")).toBe("app-123_demo");
    expect(sanitizeCheckrReportApplicationId('evil";.pdf')).toBe("evilpdf");
    expect(sanitizeCheckrReportApplicationId("   ")).toBe("demo");
    expect(sanitizeCheckrReportApplicationId(null)).toBe("demo");
  });

  it("loadCheckrStaticSampleReportPdfBytes never calls Checkr API", async () => {
    process.env.CHECKR_API_KEY = "ckr_sk_test_should_not_be_used";
    process.env.CHECKR_SAMPLE_ORDER_ID = "ord_test_should_not_be_used";

    const dir = await mkdtemp(join(tmpdir(), "axis-checkr-static-"));
    const pdfPath = join(dir, "public/samples/checkr-tenant-report.pdf");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(dir, "public/samples"), { recursive: true }));
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await writeFile(pdfPath, bytes);

    vi.doMock("node:path", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:path")>();
      return {
        ...actual,
        join: (...parts: string[]) =>
          parts.join("/").includes("public/samples/checkr-tenant-report.pdf")
            ? pdfPath
            : actual.join(...parts),
      };
    });

    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const { loadCheckrStaticSampleReportPdfBytes } = await import("@/lib/checkr/sample-report-pdf");
    const result = await loadCheckrStaticSampleReportPdfBytes();
    expect(new Uint8Array(result)).toEqual(bytes);
    await rm(dir, { recursive: true, force: true });
  });

  it("reads committed sample file when API is not configured", async () => {
    delete process.env.CHECKR_API_KEY;
    delete process.env.CHECKR_SAMPLE_ORDER_ID;
    delete process.env.CHECKR_SAMPLE_REPORT_RESOURCE_ID;

    const dir = await mkdtemp(join(tmpdir(), "axis-checkr-sample-"));
    const pdfPath = join(dir, "public/samples/checkr-tenant-report.pdf");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(dir, "public/samples"), { recursive: true }));
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await writeFile(pdfPath, bytes);

    vi.doMock("node:path", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:path")>();
      return {
        ...actual,
        join: (...parts: string[]) =>
          parts.join("/").includes("public/samples/checkr-tenant-report.pdf")
            ? pdfPath
            : actual.join(...parts),
      };
    });

    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const { loadCheckrSampleReportPdfBytes } = await import("@/lib/checkr/sample-report-pdf");
    const result = await loadCheckrSampleReportPdfBytes();
    expect(result).not.toBeNull();
    expect(new Uint8Array(result!)).toEqual(bytes);
    await rm(dir, { recursive: true, force: true });
  });
});
