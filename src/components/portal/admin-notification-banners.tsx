"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { adminLeaseKpiCounts } from "@/lib/demo-admin-leases";
import { readPartnerInboxMessages } from "@/lib/demo-admin-partner-inbox";
import { pendingInquiryCount } from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { LEASE_PIPELINE_EVENT } from "@/lib/lease-pipeline-storage";

export function AdminNotificationBanners() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const items = useMemo(() => {
    void tick;
    const leaseAdminReview = adminLeaseKpiCounts()[1];
    const inbox = readPartnerInboxMessages().filter((m) => m.folder === "inbox" && !m.read).length;
    const inquiries = pendingInquiryCount();
    const out: { id: string; href: string; text: string }[] = [];
    if (leaseAdminReview > 0) {
      out.push({
        id: "lease",
        href: "/admin/leases",
        text: `${leaseAdminReview} lease${leaseAdminReview === 1 ? "" : "s"} need admin review. Open Leases to continue.`,
      });
    }
    if (inbox > 0) {
      out.push({
        id: "inbox",
        href: "/admin/inbox/unopened",
        text: `You have ${inbox} unopened message${inbox === 1 ? "" : "s"} in your inbox.`,
      });
    }
    if (inquiries > 0) {
      out.push({
        id: "inquiry",
        href: "/admin/events",
        text: `${inquiries} partner meeting request${inquiries === 1 ? "" : "s"} waiting for your response.`,
      });
    }
    return out;
  }, [tick]);

  if (!items.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {items.map((b) => (
        <Link
          key={b.id}
          href={b.href}
          className="block rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/90"
        >
          {b.text}
        </Link>
      ))}
    </div>
  );
}
