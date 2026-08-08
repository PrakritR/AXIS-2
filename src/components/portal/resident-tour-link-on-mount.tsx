"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { clearStaleBrowserAuth } from "@/lib/supabase/safe-browser-session";
import { ensureSignedInResidentPortal } from "@/lib/tour-resident-link.client";

async function postLinkTourInquiry(tourInquiryId: string): Promise<Response> {
  return fetch("/api/auth/link-tour-inquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tourInquiryId }),
  });
}

/** After sign-in from a tour handoff, link the inquiry to the resident account once. */
export function ResidentTourLinkOnMount() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const linkedRef = useRef(false);

  useEffect(() => {
    const tourInquiryId = searchParams.get("link_tour")?.trim();
    if (!tourInquiryId || linkedRef.current) return;
    linkedRef.current = true;

    void (async () => {
      let res = await postLinkTourInquiry(tourInquiryId);
      if (res.status === 403) {
        const ensured = await ensureSignedInResidentPortal(
          `${window.location.pathname}?link_tour=${encodeURIComponent(tourInquiryId)}`,
        );
        if (ensured.ok) {
          res = await postLinkTourInquiry(tourInquiryId);
        }
      }

      if (res.status === 401) {
        linkedRef.current = false;
        const supabase = createSupabaseBrowserClient();
        await clearStaleBrowserAuth(supabase);
        const next = new URLSearchParams({
          intent: "resident",
          next: `${window.location.pathname}?link_tour=${encodeURIComponent(tourInquiryId)}`,
        });
        router.replace(`/auth/sign-in?${next.toString()}`);
        return;
      }
      if (!res.ok) {
        linkedRef.current = false;
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete("link_tour");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname);
    })().catch(() => {
      linkedRef.current = false;
    });
  }, [router, searchParams]);

  return null;
}
