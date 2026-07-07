import { describe, expect, it, vi } from "vitest";
import { fetchCheckrReportPdfBytes, parseCheckrReportResourceId } from "@/lib/checkr/report-document";

describe("checkr report document", () => {
  it("parses rp_ id from order report payload", () => {
    expect(parseCheckrReportResourceId({ id: "rp_test_abc" })).toBe("rp_test_abc");
    expect(parseCheckrReportResourceId({ report: { id: "rp_live_xyz" } })).toBe("rp_live_xyz");
    expect(parseCheckrReportResourceId({ id: "ord_test_1" })).toBeNull();
  });

  it("downloads pdf from /reports/{id}/pdf", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith("/pdf")) {
        return new Response(pdfBytes, { status: 200, headers: { "Content-Type": "application/pdf" } });
      }
      return new Response("{}", { status: 404 });
    });

    const result = await fetchCheckrReportPdfBytes(fetchMock, {
      orderId: "ord_test_1",
      reportResourceId: "rp_test_abc",
    });
    expect(result).not.toBeNull();
    expect(new Uint8Array(result!)).toEqual(pdfBytes);
  });

  it("follows documents download_uri when pdf path is missing", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes("/reports/rp_test_abc/pdf")) {
        return new Response("not found", { status: 404 });
      }
      if (path.startsWith("https://cdn.example.com/report.pdf")) {
        return new Response(pdfBytes, { status: 200, headers: { "Content-Type": "application/pdf" } });
      }
      if (path.includes("/reports/rp_test_abc")) {
        return new Response(
          JSON.stringify({
            id: "rp_test_abc",
            documents: [{ type: "pdf_report", download_uri: "https://cdn.example.com/report.pdf" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const globalFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(pdfBytes, { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );

    const result = await fetchCheckrReportPdfBytes(fetchMock, {
      orderId: "ord_test_1",
      reportResourceId: "rp_test_abc",
    });
    expect(result).not.toBeNull();
    globalFetch.mockRestore();
  });
});
