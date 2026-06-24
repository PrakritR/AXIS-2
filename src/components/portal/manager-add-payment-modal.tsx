"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Input, Select } from "@/components/ui/input";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { createManagerCharge } from "@/lib/household-charges";
import { MANAGER_PAYMENT_PRESETS, type ManagerPaymentPresetId } from "@/lib/payment-policy";
import { buildNewChargeNoticeBody, deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";

function dueLabelFromIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type PaymentPreview = {
  propertyName: string;
  propertyId: string;
  residentName: string;
  residentEmail: string;
  chargeTitle: string;
  amount: number;
  dueDateLabel: string;
  bucket: ManagerPaymentBucket;
};

export function ManagerAddPaymentModal({
  open,
  onClose,
  onSubmitted,
  managerUserId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  managerUserId: string | null;
}) {
  const { showToast } = useAppUi();
  const [propertyName, setPropertyName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [residentName, setResidentName] = useState("");
  const [residentEmail, setResidentEmail] = useState("");
  const [preset, setPreset] = useState<ManagerPaymentPresetId>("rent");
  const [chargeTitle, setChargeTitle] = useState("Monthly rent");
  const [amount, setAmount] = useState("");
  const [dueIso, setDueIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [noticePreview, setNoticePreview] = useState<PaymentPreview | null>(null);
  const [noticeBusy, setNoticeBusy] = useState(false);

  const onPresetChange = (next: ManagerPaymentPresetId) => {
    setPreset(next);
    if (next === "other") return;
    const match = MANAGER_PAYMENT_PRESETS.find((p) => p.id === next);
    if (match) setChargeTitle(match.label);
  };

  const reset = () => {
    setPropertyName("");
    setRoomNumber("");
    setResidentName("");
    setResidentEmail("");
    setPreset("rent");
    setChargeTitle("Monthly rent");
    setAmount("");
    setDueIso(new Date().toISOString().slice(0, 10));
    setBucket("pending");
    setNoticePreview(null);
    setNoticeBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const buildPreview = (): PaymentPreview | null => {
    const amountNum = Number.parseFloat(amount);
    const email = residentEmail.trim();
    if (
      !propertyName.trim() ||
      !residentName.trim() ||
      !email ||
      !email.includes("@") ||
      !chargeTitle.trim() ||
      !Number.isFinite(amountNum) ||
      amountNum <= 0
    ) {
      showToast("Enter property, resident name, resident email, charge title, and a positive amount.");
      return null;
    }

    const titleWithRoom = roomNumber.trim()
      ? `${chargeTitle.trim()} — Unit ${roomNumber.trim()}`
      : chargeTitle.trim();

    return {
      propertyName: propertyName.trim(),
      propertyId: `prop_mgr_${propertyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      residentName: residentName.trim(),
      residentEmail: email,
      chargeTitle: titleWithRoom,
      amount: amountNum,
      dueDateLabel: dueLabelFromIso(dueIso),
      bucket,
    };
  };

  const reviewPayment = () => {
    const preview = buildPreview();
    if (!preview) return;
    setNoticePreview(preview);
  };

  const confirmPayment = async (skipMessage: boolean) => {
    if (!noticePreview || noticeBusy) return;
    setNoticeBusy(true);
    try {
      const result = createManagerCharge({
        residentEmail: noticePreview.residentEmail,
        residentName: noticePreview.residentName,
        propertyId: noticePreview.propertyId,
        propertyLabel: noticePreview.propertyName,
        managerUserId,
        title: noticePreview.chargeTitle,
        amount: noticePreview.amount,
        dueDateLabel: noticePreview.dueDateLabel,
        initialStatus: noticePreview.bucket === "paid" ? "paid" : "pending",
      });
      if (!result) {
        showToast("Could not add charge. Check all fields.");
        return;
      }

      reset();
      onSubmitted();
      if (skipMessage) {
        showToast("Payment added (no notification sent).");
        return;
      }

      const amountLabel = `$${noticePreview.amount.toFixed(2)}`;
      const subject = `New charge: ${noticePreview.chargeTitle}`;
      const body = buildNewChargeNoticeBody({
        residentName: noticePreview.residentName,
        chargeTitle: noticePreview.chargeTitle,
        amountLabel,
        dueDateLabel: noticePreview.dueDateLabel,
        propertyLabel: noticePreview.propertyName,
      });
      const notice = await deliverPortalInboxMessage({
        toEmails: [noticePreview.residentEmail],
        subject,
        text: body,
      });

      if (notice.ok) {
        showToast(
          notice.skipped
            ? "Payment added. Notice sent to inbox (demo email skipped)."
            : "Payment added and notice sent via inbox and email.",
        );
      } else {
        showToast("Payment added, but notice could not be sent.");
      }
    } finally {
      setNoticeBusy(false);
      setNoticePreview(null);
    }
  };

  const previewBody =
    noticePreview &&
    buildNewChargeNoticeBody({
      residentName: noticePreview.residentName,
      chargeTitle: noticePreview.chargeTitle,
      amountLabel: `$${noticePreview.amount.toFixed(2)}`,
      dueDateLabel: noticePreview.dueDateLabel,
      propertyLabel: noticePreview.propertyName,
    });

  return (
    <>
      <Modal
        open={open && noticePreview === null}
        title="Add payment"
        onClose={handleClose}
        panelClassName="relative z-[71] mx-auto my-2 w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-2xl sm:my-4 sm:p-6"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-muted">Payment type</span>
            <Select value={preset} onChange={(e) => onPresetChange(e.target.value as ManagerPaymentPresetId)}>
              {MANAGER_PAYMENT_PRESETS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Property</span>
            <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="Demo Building" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Room / unit</span>
            <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="2A" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Resident name</span>
            <Input value={residentName} onChange={(e) => setResidentName(e.target.value)} placeholder="Alex Chen" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Resident email</span>
            <Input
              type="email"
              value={residentEmail}
              onChange={(e) => setResidentEmail(e.target.value)}
              placeholder="alex@example.com"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Charge title</span>
            <Input value={chargeTitle} onChange={(e) => setChargeTitle(e.target.value)} placeholder="April rent" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Amount (USD)</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1850"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Due date</span>
            <Input type="date" value={dueIso} onChange={(e) => setDueIso(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Status</span>
            <Select value={bucket} onChange={(e) => setBucket(e.target.value as ManagerPaymentBucket)}>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
            </Select>
          </label>
          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={reviewPayment}>
              Review & add payment
            </Button>
          </div>
        </div>
      </Modal>

      <PortalNotificationPreviewModal
        open={noticePreview !== null}
        title="New payment — notification preview"
        onClose={() => setNoticePreview(null)}
        recipient={noticePreview?.residentEmail ?? ""}
        subject={noticePreview ? `New charge: ${noticePreview.chargeTitle}` : ""}
        body={previewBody ?? ""}
        confirmLabel="Add payment & send notice"
        confirmLabelWithoutMessage="Add payment only"
        confirmBusy={noticeBusy}
        confirmBusyLabel="Adding…"
        cancelLabel="Back"
        panelClassName="relative z-[72] mx-auto my-2 w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-2xl sm:my-4 sm:p-6"
        onConfirm={(skipMessage) => void confirmPayment(skipMessage)}
      />
    </>
  );
}
