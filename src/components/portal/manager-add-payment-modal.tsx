"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Input, Select } from "@/components/ui/input";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { createManagerCharge } from "@/lib/household-charges";

function dueLabelFromIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
  const [chargeTitle, setChargeTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueIso, setDueIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");

  const reset = () => {
    setPropertyName("");
    setRoomNumber("");
    setResidentName("");
    setResidentEmail("");
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
      return;
    }

    // Derive a stable propertyId slug from the property name so charges group correctly.
    const propertyId = `prop_mgr_${propertyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

    const titleWithRoom = roomNumber.trim()
      ? `${chargeTitle.trim()} — Unit ${roomNumber.trim()}`
      : chargeTitle.trim();

    const result = createManagerCharge({
      residentEmail: email,
      residentName: residentName.trim(),
      propertyId,
      propertyLabel: propertyName.trim(),
      managerUserId,
      title: titleWithRoom,
      amount: amountNum,
      dueDateLabel: dueLabelFromIso(dueIso),
      initialStatus: bucket === "paid" ? "paid" : "pending",
    });

    if (!result) {
      showToast("Could not add charge. Check all fields.");
      return;
    }

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
          <span className="font-medium text-slate-700">Resident name</span>
          <Input value={residentName} onChange={(e) => setResidentName(e.target.value)} placeholder="Alex Chen" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Resident email</span>
          <Input
            type="email"
            value={residentEmail}
            onChange={(e) => setResidentEmail(e.target.value)}
            placeholder="alex@example.com"
            autoComplete="off"
          />
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
          <span className="font-medium text-slate-700">Status</span>
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
