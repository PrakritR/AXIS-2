import type { AccountLinkInviteDto } from "@/lib/account-links";
import { syncScheduleRecordsFromServer } from "@/lib/demo-admin-scheduling";
import { syncHouseholdChargesFromServer } from "@/lib/household-charges";
import { syncLeasePipelineFromServer } from "@/lib/lease-pipeline-storage";
import {
  MANAGER_APPLICATIONS_EVENT,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  MANAGER_INBOX_STORAGE_KEY,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import type { PortalKind } from "@/lib/portal-types";

const PREFETCH_TTL_MS = 15_000;
const ACCOUNT_LINKS_TTL_MS = 30_000;

export type AccountLinksResponse = {
  invites: AccountLinkInviteDto[];
  migrationRequired?: boolean;
};

let managerPrefetchAt = 0;
let managerPrefetchPromise: Promise<void> | null = null;

let residentPrefetchAt = 0;
let residentPrefetchPromise: Promise<void> | null = null;

let accountLinksAt = 0;
let accountLinksPromise: Promise<AccountLinksResponse> | null = null;

/** Deduped fetch for co-manager nav + account link sync. */
export async function fetchAccountLinksCached(): Promise<AccountLinksResponse> {
  const now = Date.now();
  if (accountLinksPromise && now - accountLinksAt < ACCOUNT_LINKS_TTL_MS) {
    return accountLinksPromise;
  }

  accountLinksAt = now;
  accountLinksPromise = (async () => {
    const res = await fetch("/api/pro/account-links", { credentials: "include", cache: "no-store" });
    const body = (await res.json()) as AccountLinksResponse & { error?: string };
    if (!res.ok) {
      return { invites: [], migrationRequired: true };
    }
    return {
      invites: body.invites ?? [],
      migrationRequired: body.migrationRequired,
    };
  })().catch(() => ({ invites: [], migrationRequired: true }));

  return accountLinksPromise;
}

/** Warm shared portal caches once per session (sidebar + first panel mount). */
export function prefetchPortalData(kind: PortalKind, userId?: string | null): Promise<void> {
  if (kind === "manager" || kind === "pro") {
    const now = Date.now();
    if (managerPrefetchPromise && now - managerPrefetchAt < PREFETCH_TTL_MS) {
      return managerPrefetchPromise;
    }
    managerPrefetchAt = now;
    managerPrefetchPromise = Promise.allSettled([
      syncManagerApplicationsFromServer({ managerUserId: userId ?? undefined }),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncLeasePipelineFromServer(userId ?? null),
      syncHouseholdChargesFromServer(),
      syncScheduleRecordsFromServer(),
    ]).then(() => undefined);
    return managerPrefetchPromise;
  }

  if (kind === "resident") {
    const now = Date.now();
    if (residentPrefetchPromise && now - residentPrefetchAt < PREFETCH_TTL_MS) {
      return residentPrefetchPromise;
    }
    residentPrefetchAt = now;
    residentPrefetchPromise = syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY).then(() => undefined);
    return residentPrefetchPromise;
  }

  return Promise.resolve();
}

/** Invalidate account-links cache after co-manager mutations. */
export function invalidateAccountLinksCache(): void {
  accountLinksAt = 0;
  accountLinksPromise = null;
}

/** Bump application storage listeners after prefetch. */
export function notifyManagerApplicationsSynced(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MANAGER_APPLICATIONS_EVENT));
  }
}
