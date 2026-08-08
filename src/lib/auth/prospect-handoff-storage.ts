import { isUnsafeRedirectPath } from "@/lib/auth/normalize-post-auth-path";

const STORAGE_KEY = "axis:prospect-handoff";

export type ProspectHandoffSnapshot = {
  tourInquiryId?: string;
  handoff?: "message";
  fullName?: string;
  phone?: string;
  email?: string;
  nextPath?: string;
};

function trim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function prospectHandoffFromSearchParams(params: {
  get(name: string): string | null;
}): ProspectHandoffSnapshot | null {
  const tourInquiryId = trim(params.get("tour_inquiry") ?? undefined);
  const handoff = trim(params.get("handoff") ?? undefined);
  const fullName = trim(params.get("name") ?? undefined);
  const phone = trim(params.get("phone") ?? undefined);
  const email = trim(params.get("email") ?? undefined).toLowerCase();
  const nextPath = trim(params.get("next") ?? undefined);

  if (!tourInquiryId && handoff !== "message") return null;

  return {
    ...(tourInquiryId ? { tourInquiryId } : {}),
    ...(handoff === "message" ? { handoff: "message" as const } : {}),
    ...(fullName ? { fullName } : {}),
    ...(phone ? { phone } : {}),
    ...(email.includes("@") ? { email } : {}),
    ...(nextPath && !isUnsafeRedirectPath(nextPath) ? { nextPath } : {}),
  };
}

export function persistProspectHandoff(snapshot: ProspectHandoffSnapshot): void {
  if (typeof window === "undefined") return;
  const tourInquiryId = trim(snapshot.tourInquiryId);
  const handoff = snapshot.handoff === "message" ? "message" : "";
  const fullName = trim(snapshot.fullName);
  const phone = trim(snapshot.phone);
  const email = trim(snapshot.email).toLowerCase();
  const nextPath = trim(snapshot.nextPath);
  if (!tourInquiryId && handoff !== "message") return;

  const payload: ProspectHandoffSnapshot = {
    ...(tourInquiryId ? { tourInquiryId } : {}),
    ...(handoff === "message" ? { handoff: "message" } : {}),
    ...(fullName ? { fullName } : {}),
    ...(phone ? { phone } : {}),
    ...(email.includes("@") ? { email } : {}),
    ...(nextPath && !isUnsafeRedirectPath(nextPath) ? { nextPath } : {}),
  };

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readProspectHandoff(): ProspectHandoffSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProspectHandoffSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    const tourInquiryId = trim(parsed.tourInquiryId);
    const handoff = parsed.handoff === "message" ? "message" : undefined;
    if (!tourInquiryId && handoff !== "message") return null;
    return {
      ...(tourInquiryId ? { tourInquiryId } : {}),
      ...(handoff ? { handoff } : {}),
      ...(trim(parsed.fullName) ? { fullName: trim(parsed.fullName) } : {}),
      ...(trim(parsed.phone) ? { phone: trim(parsed.phone) } : {}),
      ...(trim(parsed.email).includes("@") ? { email: trim(parsed.email).toLowerCase() } : {}),
      ...(trim(parsed.nextPath) && !isUnsafeRedirectPath(trim(parsed.nextPath))
        ? { nextPath: trim(parsed.nextPath) }
        : {}),
    };
  } catch {
    return null;
  }
}

export function clearProspectHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
