import type { ReactNode } from "react";

export function DataTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, ReactNode>[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t border-border">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>
                    {r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
