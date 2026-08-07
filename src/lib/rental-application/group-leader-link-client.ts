import { isDemoModeActive } from "@/lib/demo/demo-session";
import { normalizeApplicationAxisId, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import {
  assessGroupLeaderApplication,
  type GroupLeaderLinkPreview,
  validateGroupLeaderAppIdInput,
} from "@/lib/rental-application/group-leader-link";

export async function fetchGroupLeaderLinkPreview(leaderAppId: string): Promise<GroupLeaderLinkPreview> {
  const validated = validateGroupLeaderAppIdInput(leaderAppId);
  if (!validated.ok) {
    return { ok: false, code: "invalid_id", message: validated.message };
  }

  if (isDemoModeActive()) {
    const target = validated.normalized;
    const row =
      readManagerApplicationRows().find(
        (r) => normalizeApplicationAxisId(r.id).toUpperCase() === target,
      ) ?? null;
    return assessGroupLeaderApplication(target, row);
  }

  const q = new URLSearchParams({ leaderAppId: validated.normalized });
  const res = await fetch(`/api/public/group-application-link?${q.toString()}`);
  const body = (await res.json().catch(() => null)) as GroupLeaderLinkPreview | null;
  if (!body || typeof body !== "object" || !("ok" in body)) {
    return {
      ok: false,
      code: "not_found",
      message: "Could not verify that group link. Try again in a moment.",
    };
  }
  return body;
}
