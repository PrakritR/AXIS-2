"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RESIDENT_INBOX_THREAD_FALLBACK } from "@/components/portal/resident-inbox-panel";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { readInboxMessages } from "@/lib/demo-admin-partner-inbox";
import { adminLeaseKpiCounts } from "@/lib/demo-admin-leases";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
import {
  readPartnerInquiries,
  syncScheduleRecordsFromServer,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { LEASE_PIPELINE_EVENT, syncLeasePipelineFromServer } from "@/lib/lease-pipeline-storage";
import {
  applicationVisibleToPortalUser,
} from "@/lib/manager-portfolio-access";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
} from "@/lib/manager-applications-storage";
import {
  countUnopenedPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  RESIDENT_INBOX_STORAGE_KEY,
} from "@/lib/portal-inbox-storage";
import { prefetchPortalData } from "@/lib/portal-data-store";
import type { PortalKind } from "@/lib/portal-types";

/** Pending / unread counts for sidebar nav badges (0 = hide badge). */
export function usePortalNavCounts(kind: PortalKind): Partial<Record<string, number>> {
  const { userId, ready } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (kind === "admin") {
      void Promise.allSettled([
        syncScheduleRecordsFromServer(),
        syncLeasePipelineFromServer(null),
      ]).then(() => bump());
    } else if (kind === "manager" || kind === "pro") {
      void prefetchPortalData(kind, userId ?? undefined).then(() => bump());
    } else if (kind === "resident") {
      void prefetchPortalData(kind).then(() => bump());
    }

    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, [kind, bump, userId]);

  return useMemo(() => {
    void tick;
    if (!ready && (kind === "manager" || kind === "pro" || kind === "resident")) {
      return {};
    }

    if (kind === "admin") {
      const [pendingProps] = adminKpiCounts();
      const [, adminBucket] = adminLeaseKpiCounts();
      const inboxUnread = readInboxMessages().filter((m) => m.folder === "inbox" && !m.read).length;
      const pendingMeetings = readPartnerInquiries().filter((r) => r.status === "pending" && r.kind !== "tour").length;
      const pendingTours = readPartnerInquiries().filter((r) => r.kind === "tour" && r.status === "pending").length;
      return {
        properties: pendingProps,
        leases: adminBucket,
        events: pendingMeetings + pendingTours,
        inbox: inboxUnread,
      };
    }

    if ((kind === "manager" || kind === "pro") && userId) {
      const [pendingProps] = adminKpiCounts(userId);
      const pendingApps = readManagerApplicationRows().filter(
        (a) => applicationVisibleToPortalUser(a, userId) && a.bucket === "pending",
      ).length;
      const inbox = countUnopenedPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
      return {
        properties: pendingProps,
        applications: pendingApps,
        inbox,
      };
    }

    if (kind === "resident") {
      const inbox = countUnopenedPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK);
      return { inbox };
    }

    return {};
  }, [kind, ready, tick, userId]);
}
