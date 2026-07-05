import { GET_STARTED_PATH } from "@/lib/auth/get-started-path";
import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";

const RESOLVE_ATTEMPTS = 8;
const RESOLVE_BASE_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Client-side: ask the server where a signed-in user should land after auth. */
export async function resolvePostAuthDestination(nextPath: string): Promise<{
  redirectTo: string | null;
  resolutionFailed: boolean;
}> {
  const next = nextPath.startsWith("/") ? nextPath : "/auth/continue";

  for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`/api/auth/oauth-portal-access?next=${encodeURIComponent(next)}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401 && attempt < RESOLVE_ATTEMPTS - 1) {
        await sleep(RESOLVE_BASE_DELAY_MS + attempt * 200);
        continue;
      }

      if (!res.ok) {
        if (attempt < RESOLVE_ATTEMPTS - 1) {
          await sleep(RESOLVE_BASE_DELAY_MS + attempt * 200);
          continue;
        }
        return { redirectTo: null, resolutionFailed: true };
      }

      const body = (await res.json()) as { redirectTo?: string };
      const candidate = body.redirectTo?.startsWith("/") ? normalizePostAuthPath(body.redirectTo) : null;
      if (!candidate || candidate === "/auth/continue") {
        if (attempt < RESOLVE_ATTEMPTS - 1) {
          await sleep(RESOLVE_BASE_DELAY_MS + attempt * 200);
          continue;
        }
        return { redirectTo: null, resolutionFailed: true };
      }

      return { redirectTo: candidate, resolutionFailed: false };
    } catch {
      if (attempt < RESOLVE_ATTEMPTS - 1) {
        await sleep(RESOLVE_BASE_DELAY_MS + attempt * 200);
        continue;
      }
      return { redirectTo: null, resolutionFailed: true };
    }
  }

  return { redirectTo: null, resolutionFailed: true };
}

export function isGetStartedDestination(path: string): boolean {
  return path === GET_STARTED_PATH || path.startsWith(`${GET_STARTED_PATH}?`);
}
