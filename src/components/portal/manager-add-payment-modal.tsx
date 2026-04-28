"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Input, Select } from "@/components/ui/input";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { addCustomManagerPaymentRow } from "@/lib/demo-manager-payment-ledger";

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function dueLabelFromIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function rowFromForm(input: {
  propertyName: string;
  roomNumber: string;
  residentName: string;
  chargeTitle: string;
  amountNum: number;
  dueIso: string;
  bucket: ManagerPaymentBucket;
}): DemoManagerPaymentLedgerRow {
  const lineAmount = formatUsd(input.amountNum);
  const dueDate = dueLabelFromIso(input.dueIso);

  if (input.bucket === "paid") {
    return {
      id: `mgr-pay-${crypto.randomUUID()}`,
      propertyName: input.propertyName.trim(),
      roomNumber: input.roomNumber.trim(),
      residentName: input.residentName.trim(),
      chargeTitle: input.chargeTitle.trim(),
      lineAmount,
      amountPaid: lineAmount,
      balanceDue: "$0.00",
      dueDate,
      bucket: "paid",
      statusLabel: "Paid",
      notes: "Added manually from Axis Pro Portal.",
    };
  }

  if (input.bucket === "overdue") {
    return {
      id: `mgr-pay-${crypto.randomUUID()}`,
      propertyName: input.propertyName.trim(),
      roomNumber: input.roomNumber.trim(),
      residentName: input.residentName.trim(),
      chargeTitle: input.chargeTitle.trim(),
      lineAmount,
      amountPaid: "$0.00",
      balanceDue: lineAmount,
      dueDate,
      bucket: "overdue",
      statusLabel: "Overdue",
      notes: "Added manually from Axis Pro Portal.",
    };
  }

  return {
    id: `mgr-pay-${crypto.randomUUID()}`,
    propertyName: input.propertyName.trim(),
    roomNumber: input.roomNumber.trim(),
    residentName: input.residentName.trim(),
    chargeTitle: input.chargeTitle.trim(),
    lineAmount,
    amountPaid: "$0.00",
    balanceDue: lineAmount,
    dueDate,
    bucket: "pending",
    statusLabel: "Pending",
    notes: "Added manually from Axis Pro Portal.",
  };
}

export function ManagerAddPaymentModal({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { showToast } = useAppUi();
  const [propertyName, setPropertyName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [residentName, setResidentName] = useState("");
  const [chargeTitle, setChargeTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueIso, setDueIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");

  const reset = () => {
    setPropertyName("");
    setRoomNumber("");
    setResidentName("");
    setChargeTitle("");
    setAmount("");
    setDueIso(new Date().toISOString().slice(0, 10));
    setBucket("pending");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = () => {
    const amountNum = Number.parseFloat(amount);
    if (
      !propertyName.trim() ||
      !roomNumber.trim() ||
      !residentName.trim() ||
      !chargeTitle.trim() ||
      !Number.isFinite(amountNum) ||
      amountNum <= 0
    ) {
      showToast("Enter property, room, resident, charge, and a positive amount.");
      return;
    }
    addCustomManagerPaymentRow(
      rowFromForm({
        propertyName,
        roomNumber,
        residentName,
        chargeTitle,
        amountNum,
        dueIso,
        bucket,
      }),
    );
    reset();
    onSubmitted();
  };

  return (
    <Modal
      open={open}
      title="Add payment"
      onClose={handleClose}
      panelClassName="relative z-[71] mx-auto my-2 w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:my-4 sm:p-6"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Property</span>
          <Input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="Demo Building" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Room / unit</span>
          <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="2A" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Resident</span>
          <Input value={residentName} onChange={(e) => setResidentName(e.target.value)} placeholder="Alex Chen" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Charge</span>
          <Input value={chargeTitle} onChange={(e) => setChargeTitle(e.target.value)} placeholder="April rent" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Amount (USD)</span>
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
          <span className="font-medium text-slate-700">Due date</span>
          <Input type="date" value={dueIso} onChange={(e) => setDueIso(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Bucket</span>
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
          <Button type="button" variant="primary" className="rounded-full" onClick={submit}>
            Add payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
