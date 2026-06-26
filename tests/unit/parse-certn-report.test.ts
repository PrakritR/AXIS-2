import { describe, expect, it } from "vitest";
import { parseCertnReportPayload } from "@/lib/screening/parse-certn-report";

describe("parseCertnReportPayload", () => {
  it("parses completed credit and criminal summary", () => {
    const parsed = parseCertnReportPayload({
      id: "order-1",
      tag: "AXIS-123",
      report_status: "COMPLETE",
      result_label: "Cleared",
      equifax_result: { credit_score: 702 },
      us_criminal_record_check_result: { criminal_cases: [], result: "CLEARED" },
      applicant: { report_url: "https://app.certn.co/hr/applications/order-1/" },
    });
    expect(parsed?.externalOrderId).toBe("order-1");
    expect(parsed?.status).toBe("complete");
    expect(parsed?.creditScore).toBe(702);
    expect(parsed?.criminalFlags).toBe(0);
    expect(parsed?.reportUrl).toContain("order-1");
  });

  it("counts criminal cases", () => {
    const parsed = parseCertnReportPayload({
      id: "order-2",
      report_status: "COMPLETE",
      us_criminal_record_check_result: {
        criminal_cases: [{ id: "case-1" }],
        result: "REVIEW",
      },
    });
    expect(parsed?.criminalFlags).toBe(1);
  });
});
