"use client";

import type { ReactNode } from "react";
import type { PropertyRentReceiptDocument, RentReceiptDocument } from "@/lib/reports/formal-documents/spec";
import type { ReportResult } from "@/lib/reports/types";

function DocumentPaper({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-[820px] rounded-xl border border-border bg-white text-[#1a1a1a] shadow-[0_8px_30px_rgba(15,23,42,0.08)] ${className}`}
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      {children}
    </div>
  );
}

function DocHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-[#e5e7eb] px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
            Axis Property Management
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a]">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-xs text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
          <p>Official record</p>
          <p className="mt-0.5 font-medium text-[#334155]">{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>
    </div>
  );
}

function DocFooter({ certification }: { certification: string }) {
  return (
    <div className="border-t border-[#e5e7eb] px-8 py-5">
      <p className="text-[11px] leading-relaxed text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
        {certification}
      </p>
      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <div>
          <div className="border-b border-[#94a3b8] pb-1" />
          <p className="mt-1 text-xs text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
            Authorized signature
          </p>
        </div>
        <div>
          <div className="border-b border-[#94a3b8] pb-1" />
          <p className="mt-1 text-xs text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
            Date
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
        {label}
      </p>
      {lines.filter(Boolean).map((line) => (
        <p key={line} className="mt-1 text-sm leading-snug text-[#0f172a]">
          {line}
        </p>
      ))}
    </div>
  );
}

export function RentReceiptDocumentView({ doc }: { doc: RentReceiptDocument }) {
  return (
    <DocumentPaper className="mb-6">
      <DocHeader title="Rent Receipt" subtitle={`Receipt # ${doc.receiptNumber}`} />
      <div className="space-y-5 px-8 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoBlock label="Received by (landlord / property manager)" lines={[doc.landlordName, ...doc.landlordAddress.split("\n")]} />
          <InfoBlock label="Paid by (tenant)" lines={[doc.tenantName, doc.tenantEmail]} />
        </div>
        <InfoBlock
          label="Rental property"
          lines={[`${doc.propertyLabel}${doc.unitLabel && doc.unitLabel !== "—" ? ` · Unit ${doc.unitLabel}` : ""}`, doc.propertyAddress]}
        />

        <div className="overflow-hidden rounded-lg border border-[#e5e7eb]">
          <table className="w-full border-collapse text-sm" style={{ fontFamily: "system-ui, sans-serif" }}>
            <tbody>
              <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
                <td className="px-4 py-2.5 font-semibold text-[#475569]">Payment date</td>
                <td className="px-4 py-2.5 text-[#0f172a]">{doc.paymentDate}</td>
              </tr>
              <tr className="border-b border-[#e5e7eb]">
                <td className="px-4 py-2.5 font-semibold text-[#475569]">Amount received</td>
                <td className="px-4 py-2.5 text-lg font-bold text-[#0f172a]">{doc.amount}</td>
              </tr>
              <tr className="border-b border-[#e5e7eb]">
                <td className="px-4 py-2.5 font-semibold text-[#475569]">Payment method</td>
                <td className="px-4 py-2.5 text-[#0f172a]">{doc.paymentMethod}</td>
              </tr>
              <tr className="border-b border-[#e5e7eb]">
                <td className="px-4 py-2.5 font-semibold text-[#475569]">Period / description</td>
                <td className="px-4 py-2.5 text-[#0f172a]">{doc.periodCovered}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold text-[#475569]">Category</td>
                <td className="px-4 py-2.5 text-[#0f172a]">{doc.category}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm leading-relaxed text-[#334155]">
          I, <strong>{doc.landlordName}</strong>, acknowledge receipt of <strong>{doc.amount}</strong> from{" "}
          <strong>{doc.tenantName}</strong> for the rental property described above. This receipt constitutes proof of payment
          for the period stated and should be retained for tax and legal records.
        </p>
      </div>
      <DocFooter certification="This document is an official payment receipt generated from Axis property records. Retain for your records. Consult a tax or legal advisor for compliance in your jurisdiction." />
    </DocumentPaper>
  );
}

export function PropertyRentReceiptDocumentView({ doc }: { doc: PropertyRentReceiptDocument }) {
  return (
    <DocumentPaper className="mb-6">
      <DocHeader
        title="Property Income & Occupancy Statement"
        subtitle={`${doc.propertyLabel} · ${doc.periodFrom} to ${doc.periodTo}`}
      />
      <div className="space-y-5 px-8 py-6">
        <InfoBlock label="Property owner / manager" lines={[doc.landlordName, ...doc.landlordAddress.split("\n")]} />

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Days rented", value: String(doc.daysRented) },
            { label: "Days available", value: String(doc.daysAvailable) },
            { label: "Rental use", value: `${doc.rentalUsePct}%` },
            { label: "Rent collected", value: doc.rentCollected },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[#e5e7eb] bg-[#f8fafc] px-3 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
                {item.label}
              </p>
              <p className="mt-1 text-lg font-bold text-[#0f172a]">{item.value}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#64748b]" style={{ fontFamily: "system-ui, sans-serif" }}>
            Unit detail
          </p>
          <div className="overflow-hidden rounded-lg border border-[#e5e7eb]">
            <table className="w-full border-collapse text-sm" style={{ fontFamily: "system-ui, sans-serif" }}>
              <thead>
                <tr className="border-b border-[#e5e7eb] bg-[#f1f5f9] text-left text-xs uppercase tracking-wide text-[#475569]">
                  <th className="px-4 py-2.5 font-semibold">Unit</th>
                  <th className="px-4 py-2.5 font-semibold">Resident</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Days rented</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Rent collected</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Receipts</th>
                </tr>
              </thead>
              <tbody>
                {doc.units.map((unit) => (
                  <tr key={`${unit.unit}-${unit.resident}`} className="border-b border-[#e5e7eb] last:border-0">
                    <td className="px-4 py-2.5 text-[#0f172a]">{unit.unit}</td>
                    <td className="px-4 py-2.5 text-[#0f172a]">{unit.resident}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#0f172a]">
                      {unit.daysRented}/{unit.daysAvailable}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[#0f172a]">{unit.rentCollected}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#0f172a]">{unit.receiptCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#f8fafc] font-semibold">
                  <td className="px-4 py-2.5 text-[#0f172a]" colSpan={2}>
                    Total ({doc.receiptCount} payment{doc.receiptCount === 1 ? "" : "s"})
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#0f172a]">{doc.daysRented}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#0f172a]">{doc.rentCollected}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#0f172a]">{doc.receiptCount}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      <DocFooter certification="This statement summarizes rent collected and occupancy for the property and period shown. Use for owner reporting, tax preparation, and audit support." />
    </DocumentPaper>
  );
}

export function FinancialReportDocumentView({ report }: { report: ReportResult }) {
  const period =
    report.meta?.from && report.meta?.to ? `${String(report.meta.from)} — ${String(report.meta.to)}` : undefined;

  return (
    <DocumentPaper>
      <DocHeader title={report.title} subtitle={period ? `Reporting period: ${period}` : undefined} />
      <div className="px-8 py-6">
        <div className="overflow-hidden rounded-lg border border-[#e5e7eb]">
          <table className="w-full border-collapse text-sm" style={{ fontFamily: "system-ui, sans-serif" }}>
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f1f5f9] text-left text-xs uppercase tracking-wide text-[#475569]">
                {report.columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2.5 font-semibold ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, idx) => (
                <tr key={idx} className="border-b border-[#e5e7eb] last:border-0">
                  {report.columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-[#0f172a] ${col.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {String(row[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {report.totals ? (
              <tfoot>
                <tr className="bg-[#f8fafc] font-semibold">
                  {report.columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-[#0f172a] ${col.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {String(report.totals![col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
      <DocFooter certification="Prepared from Axis ledger records. This report is provided for property management and tax record-keeping. Verify totals against bank statements and consult your tax advisor." />
    </DocumentPaper>
  );
}

export function FormalDocumentsPreview({
  propertyDocuments,
  rentReceipts,
}: {
  propertyDocuments?: PropertyRentReceiptDocument[];
  rentReceipts?: RentReceiptDocument[];
}) {
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-[#eef2f7] p-4 sm:p-6">
      {propertyDocuments?.map((doc) => (
        <PropertyRentReceiptDocumentView key={doc.id} doc={doc} />
      ))}
      {rentReceipts?.map((doc) => (
        <RentReceiptDocumentView key={doc.id} doc={doc} />
      ))}
    </div>
  );
}
