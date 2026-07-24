"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { GoogleCalendarConnectPanel } from "@/components/portal/google-calendar-connect-panel";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";

export function GoogleCalendarConnectDialog({ onConnectionChange }: { onConnectionChange?: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "connected" || gcal === "error") setOpen(true);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        onClick={() => {
          // #region agent log
          fetch("http://127.0.0.1:7293/ingest/77aa960a-bec3-48b1-bf3d-3eb4c10cfddf", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "81cbea" },
            body: JSON.stringify({
              sessionId: "81cbea",
              location: "google-calendar-connect-dialog.tsx:onClick",
              message: "header button clicked",
              data: { hypothesisId: "H9" },
              timestamp: Date.now(),
            }),
          }).catch(() => undefined);
          // #endregion
          setOpen(true);
        }}
        data-attr="google-calendar-header-btn"
      >
        Google Calendar
      </Button>
      <Modal open={open} title="Google Calendar" onClose={() => setOpen(false)}>
        <GoogleCalendarConnectPanel
          presentation="dialog"
          onConnectionChange={() => {
            onConnectionChange?.();
          }}
        />
      </Modal>
    </>
  );
}
