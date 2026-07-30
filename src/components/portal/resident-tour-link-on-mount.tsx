"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** After sign-in from a tour handoff, link the inquiry to the resident account once. */
export function ResidentTourLinkOnMount() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const linkedRef = useRef(false);

  useEffect(() => {
    const tourInquiryId = searchParams.get("link_tour")?.trim();
    if (!tourInquiryId || linkedRef.current) return;
    linkedRef.current = true;

    void fetch("/api/auth/link-tour-inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tourInquiryId }),
    })
      .then(() => {
        const next = new URLSearchParams(searchParams.toString());
        next.delete("link_tour");
        const qs = next.toString();
        router.replace(qs ? `?${qs}` : window.location.pathname);
      })
      .catch(() => undefined);
  }, [router, searchParams]);

  return null;
}
