import type { DemoApplicantRow } from "@/data/demo-portal";
import { demoApplicantRows } from "@/data/demo-portal";

const KEY = "axis_manager_applications_v1";
export const MANAGER_APPLICATIONS_EVENT = "axis:manager-applications";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emit() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(MANAGER_APPLICATIONS_EVENT));
}

export function readManagerApplicationRows(fallback: DemoApplicantRow[] = demoApplicantRows): DemoApplicantRow[] {
  if (!canUseStorage()) return [...fallback];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...fallback];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.length === 0) return [...fallback];
    const stored = v as DemoApplicantRow[];
    return stored.map((r) => {
      const seed = fallback.find((f) => f.id === r.id);
      if (!seed) return r;
      return {
        ...seed,
        ...r,
        application: r.application ?? seed.application,
      };
    });
  } catch {
    return [...fallback];
  }
}

export function writeManagerApplicationRows(rows: DemoApplicantRow[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    emit();
    /** Approved applications → lease pipeline rows (async to avoid circular imports). */
    void import("@/lib/lease-pipeline-storage").then(({ readLeasePipeline }) => {
      readLeasePipeline();
    });
  } catch {
    /* quota */
  }
}

export function resetManagerApplicationRowsToDemo(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(KEY);
  emit();
}
