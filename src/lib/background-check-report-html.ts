import type { DemoApplicantRow } from "@/data/demo-portal";
import { buildCheckrTenantReportHtml } from "@/lib/checkr/tenant-report-html";
import { clean, escapeHtml, freeTextSection, section } from "@/lib/manager-application-html";
import { recommendationLabel } from "@/lib/screening/recommendation";
import { leaseCss } from "@/lib/lease-templates/types";

function list(title: string, items: string[]): string {
  const populated = items.filter((item) => item.trim());
  if (populated.length === 0) return "";
  const rows = populated.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n  ");
  return `
<h2>${escapeHtml(title)}</h2>
<ul>
  ${rows}
</ul>`;
}

function money(cents: number | undefined): string {
  return typeof cents === "number" && cents > 0 ? `$${(cents / 100).toFixed(2)}` : "";
}

export type BackgroundCheckReportHtmlOptions = {
  /** ISO generation timestamp; defaults to now. */
  generatedAt?: string;
};

/**
 * Clean rendered-document view of an applicant's credit/background screening
 * (Certn) and Checkr order, matching the application/lease document
 * presentation. Meant for an `srcDoc` iframe. Returns "" when the row has
 * neither a screening report nor a background check to show.
 */
export function buildBackgroundCheckReportHtml(
  row: DemoApplicantRow,
  options: BackgroundCheckReportHtmlOptions = {},
): string {
  const screening = row.screening;
  const bg = row.backgroundCheck;
  if (!screening && !bg) return "";

  if (bg?.reportSnapshot || (bg && bg.status === "complete")) {
    const tenantHtml = buildCheckrTenantReportHtml(row);
    if (tenantHtml) return tenantHtml;
  }

  const applicantName = clean(row.name) || "Applicant";
  const axisId = clean(row.id) || "—";
  const generated = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const generatedLabel = generated.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

  const body = `
<h1>BACKGROUND &amp; CREDIT CHECK REPORT</h1>
<p class="sub">PropLane · Screening record</p>
<p class="generated">PropLane ID ${escapeHtml(axisId)} · ${escapeHtml(applicantName)} · Generated ${escapeHtml(generatedLabel)}</p>

${
  screening
    ? section("Credit & background screening", [
        { label: "Recommendation", value: recommendationLabel(screening.recommendation) },
        { label: "Credit score", value: screening.creditScore != null ? String(screening.creditScore) : "" },
        { label: "Credit rating", value: screening.creditRating ?? "" },
        { label: "Criminal flags", value: screening.criminalFlags != null ? String(screening.criminalFlags) : "" },
        { label: "Eviction flags", value: screening.evictionFlags != null ? String(screening.evictionFlags) : "" },
        { label: "Income verified", value: screening.incomeVerified ? "Yes" : "" },
        { label: "Report cost", value: money(screening.costCents) },
      ])
    : ""
}

${screening ? freeTextSection("Summary", screening.summary) : ""}

${screening ? list("Pros", screening.pros) : ""}

${screening ? list("Cons", screening.cons) : ""}

${
  bg
    ? section("Checkr background check", [
        { label: "Status", value: bg.status },
        { label: "Result", value: bg.result ?? "Pending" },
        { label: "Package", value: bg.packageSlug },
        { label: "Ordered", value: bg.orderedAt ? new Date(bg.orderedAt).toLocaleDateString() : "" },
        { label: "Completed", value: bg.completedAt ? new Date(bg.completedAt).toLocaleDateString() : "" },
        { label: "Report cost", value: money(bg.costCents) },
      ])
    : ""
}

<p class="footnote">Generated from PropLane screening records. Consult the full vendor report before any adverse action. PropLane · Confidential</p>
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Background Check Report — ${escapeHtml(applicantName)}</title>
  <style>${leaseCss()}
    html, body { background: #fff; }
    ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
    li { margin-bottom: 0.3rem; }
    .footnote { margin-top: 2.4rem; border-top: 1px solid #ccc; padding-top: 0.8rem; font-size: 0.8rem; font-style: italic; color: #777; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
