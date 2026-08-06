"use client";

import { Button } from "@/components/ui/button";
import {
  manualContactForCharges,
  residentManualPaymentMethodLabel,
  type ResidentManualPaymentChannel,
} from "@/lib/platform/resident-payments";
import type { HouseholdCharge } from "@/lib/household-charges";
import { useResidentManualPaymentCheck } from "@/hooks/use-resident-manual-payment-check";

type ResidentManualPaymentPanelProps = {
  chargeIds: string[];
  charges: HouseholdCharge[];
  channel: ResidentManualPaymentChannel;
  totalLabel: string;
  enabled?: boolean;
  autoCheck?: boolean;
  reporting?: boolean;
  onPaid?: (charges: HouseholdCharge[]) => void;
  onReportSent?: () => void;
  showReportSent?: boolean;
};

export function ResidentManualPaymentPanel({
  chargeIds,
  charges,
  channel,
  totalLabel,
  enabled = true,
  autoCheck = true,
  reporting = false,
  onPaid,
  onReportSent,
  showReportSent = true,
}: ResidentManualPaymentPanelProps) {
  const contact = manualContactForCharges(charges, channel);
  const reference = charges.find((c) => c.paymentReference)?.paymentReference;
  const channelLabel = residentManualPaymentMethodLabel(channel);
  const isZelle = channel === "zelle";

  const { checking, error, paid, runCheck } = useResidentManualPaymentCheck({
    enabled: enabled && chargeIds.length > 0,
    chargeIds,
    channel,
    autoCheck,
    onPaid,
  });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5" data-attr="resident-manual-payment-panel">
      {isZelle ? (
        <div className="rounded-xl border px-4 py-3 text-sm portal-banner-success">
          <p className="font-semibold">Send by Zelle</p>
          {contact ? (
            <p className="mt-2 rounded-lg border border-emerald-300/80 bg-card px-3 py-2 font-mono text-base font-bold tracking-tight">
              {contact}
            </p>
          ) : null}
          <p className="mt-2 leading-relaxed">
            Send <span className="font-semibold tabular-nums">{totalLabel}</span>
            {reference ? (
              <>
                {" "}
                and include code <span className="font-mono font-semibold">{reference}</span> in the memo
              </>
            ) : (
              <> and include your name in the memo</>
            )}
            , then tap <span className="font-semibold">Check payment</span> below.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border px-4 py-3 text-sm portal-banner-info">
          <p className="font-semibold">Send by Venmo</p>
          {contact ? (
            <p className="mt-2 rounded-lg border border-sky-300/80 bg-card px-3 py-2 font-mono text-base font-bold tracking-tight">
              {contact}
            </p>
          ) : null}
          <p className="mt-2 leading-relaxed">
            Send <span className="font-semibold tabular-nums">{totalLabel}</span>
            {reference ? (
              <>
                {" "}
                and include code <span className="font-mono font-semibold">{reference}</span> in the note
              </>
            ) : (
              <> and include your name in the note</>
            )}
            , then tap <span className="font-semibold">Check payment</span> below.
          </p>
        </div>
      )}

      {paid ? (
        <p className="text-sm font-medium text-[var(--status-confirmed-fg)]">Payment received.</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-sm text-muted">
          After you send payment via {channelLabel}, we&apos;ll check for it automatically every few seconds.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          className="rounded-full"
          disabled={checking || paid || reporting}
          data-attr="resident-check-manual-payment"
          onClick={() => void runCheck()}
        >
          {checking ? "Checking…" : paid ? "Payment received" : "Check payment"}
        </Button>
        {showReportSent && onReportSent && !paid ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={checking || reporting}
            data-attr="resident-payments-report-sent"
            onClick={onReportSent}
          >
            {reporting ? "Saving…" : "I sent payment"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
