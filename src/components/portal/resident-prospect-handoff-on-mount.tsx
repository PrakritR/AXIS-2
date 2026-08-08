"use client";

import { useEffect, useRef } from "react";
import { clearProspectHandoff, readProspectHandoff } from "@/lib/auth/prospect-handoff-storage";

/** After sign-in from a tour/message handoff, link prospect activity to the signed-in account once. */
export function ResidentProspectHandoffOnMount() {
  const linkedRef = useRef(false);

  useEffect(() => {
    if (linkedRef.current) return;
    const handoff = readProspectHandoff();
    if (!handoff || (!handoff.tourInquiryId && handoff.handoff !== "message")) return;
    linkedRef.current = true;

    void fetch("/api/auth/complete-prospect-handoff-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(handoff),
    })
      .then((res) => {
        if (res.ok) clearProspectHandoff();
        else linkedRef.current = false;
      })
      .catch(() => {
        linkedRef.current = false;
      });
  }, []);

  return null;
}
