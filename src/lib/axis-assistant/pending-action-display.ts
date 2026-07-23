/**
 * Pure display helpers for the dashboard "AI drafts" chips. Kept free of React
 * and network so the categorization/summary logic is unit-testable in isolation.
 */
import type { ActionPreview } from "@/lib/axis-assistant/use-assistant-conversation";

export type PendingActionListItem = {
  id: string;
  toolName: string;
  preview: ActionPreview;
  createdAt: string | null;
};

/**
 * Normalize the loosely-typed `/api/agent/pending-actions` payload into the
 * items the dashboard renders, dropping anything without the minimum a chip
 * needs (an id and a preview with a title). Never throws on malformed rows.
 */
export function normalizePendingActions(raw: unknown): PendingActionListItem[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { actions?: unknown }).actions;
  if (!Array.isArray(list)) return [];
  const out: PendingActionListItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    const preview = e.preview;
    if (!id || !preview || typeof preview !== "object") continue;
    const p = preview as Record<string, unknown>;
    const title = typeof p.title === "string" ? p.title.trim() : "";
    if (!title) continue;
    const fields = Array.isArray(p.fields)
      ? (p.fields as unknown[])
          .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
          .map((f) => ({
            label: String((f as Record<string, unknown>).label ?? ""),
            value: String((f as Record<string, unknown>).value ?? ""),
          }))
      : [];
    out.push({
      id,
      toolName: typeof e.toolName === "string" ? e.toolName : "",
      preview: {
        kind: typeof p.kind === "string" ? p.kind : "",
        title,
        confirmLabel: typeof p.confirmLabel === "string" ? p.confirmLabel : "Confirm",
        fields,
        warnings: Array.isArray(p.warnings) ? p.warnings.map((w) => String(w)) : undefined,
      },
      createdAt: typeof e.createdAt === "string" ? e.createdAt : null,
    });
  }
  return out;
}

/**
 * Chip title + subtitle for one draft, matching the marketing mock's
 * "PropLane · Rent reminder draft" / "Jordan Lee · Maple 2A · ready to approve"
 * shape. The subtitle prefers a Recipient/To field, falling back to the first
 * preview field's value, and always ends with "ready to approve".
 */
export function pendingActionChipContent(item: PendingActionListItem): {
  title: string;
  subtitle: string;
} {
  const fields = item.preview.fields;
  const recipientField = fields.find((f) =>
    /recipient|to|resident|tenant/i.test(f.label),
  );
  const lead = (recipientField?.value ?? fields[0]?.value ?? "").trim();
  const subtitle = [lead, "ready to approve"].filter(Boolean).join(" · ");
  return {
    title: `PropLane · ${item.preview.title}`,
    subtitle,
  };
}
