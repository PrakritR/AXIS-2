"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import {
  approveServiceRequest,
  deleteServiceRequest,
  denyServiceRequest,
  updateServiceRequest,
  type ServiceRequest,
} from "@/lib/service-requests-storage";

export type ManagerServiceRequestBucket = "pending" | "approved" | "denied";

export function managerServiceRequestBucket(status: ServiceRequest["status"]): ManagerServiceRequestBucket {
  if (status === "pending") return "pending";
  if (status === "denied") return "denied";
  return "approved";
}

export function serviceRequestHasDeposit(dep: string): boolean {
  return dep.trim() !== "" && dep.trim() !== "0" && dep.trim() !== "$0";
}

export function managerServiceRequestPricingSummary(req: ServiceRequest): string {
  if (req.price?.trim()) return req.price.trim();
  if (req.priceLimit?.trim()) return `Limit ${req.priceLimit.trim()}`;
  return "—";
}

function serviceRequestStatusLabel(status: ServiceRequest["status"]): string {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "denied") return "Denied";
  return "Returned";
}

export function ManagerServiceRequestDetail({
  req,
  propertyLabel,
  onUpdated,
  onApproved,
  onDenied,
  onCollapsed,
  allowDelete = true,
}: {
  req: ServiceRequest;
  propertyLabel?: string;
  onUpdated: () => void;
  onApproved?: () => void;
  onDenied?: () => void;
  onCollapsed?: () => void;
  allowDelete?: boolean;
}) {
  const { showToast } = useAppUi();
  const needsReturn = serviceRequestHasDeposit(req.deposit);
  const description = req.offerDescription?.trim() ?? "";
  const showDescription =
    description.length > 0 && description !== "Add-on service booked through the resident portal.";
  const [editingCharges, setEditingCharges] = useState(false);
  const [editPrice, setEditPrice] = useState(req.price ?? "");
  const [editDeposit, setEditDeposit] = useState(req.deposit ?? "");

  useEffect(() => {
    setEditPrice(req.price ?? "");
    setEditDeposit(req.deposit ?? "");
    setEditingCharges(false);
  }, [req.id, req.price, req.deposit]);

  const chargesSummary = managerServiceRequestPricingSummary(req);
  const depositSummary = needsReturn && req.deposit?.trim() ? req.deposit.trim() : null;

  const saveCharges = () => {
    updateServiceRequest(req.id, {
      price: editPrice.trim(),
      deposit: editDeposit.trim(),
    });
    onUpdated();
    setEditingCharges(false);
    showToast("Charges updated.");
  };

  return (
    <>
      <div className="space-y-1 text-sm text-muted">
        {propertyLabel ? (
          <p>
            Property: <span className="text-foreground">{propertyLabel}</span>
          </p>
        ) : null}
        <p>
          Service: <span className="text-foreground">{req.offerName}</span>
        </p>
        <p>
          Charges: <span className="tabular-nums text-foreground">{chargesSummary}</span>
          {depositSummary ? (
            <>
              {" "}
              · Deposit: <span className="tabular-nums text-foreground">{depositSummary}</span>
            </>
          ) : null}
        </p>
        <p>
          Status: <span className="text-foreground">{serviceRequestStatusLabel(req.status)}</span>
        </p>
        {showDescription ? <p className="pt-1">{description}</p> : null}
        {req.priceLimit?.trim() && !req.price?.trim() ? (
          <p>
            Resident price limit: <span className="font-semibold text-foreground">{req.priceLimit.trim()}</span>
          </p>
        ) : null}
        {req.notes ? <p className="italic">&ldquo;{req.notes}&rdquo;</p> : null}
      </div>

      {req.status === "pending" && editingCharges ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-28">
            <p className="mb-1 text-[11px] font-medium text-muted">Service fee</p>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted">$</span>
              <Input
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder={req.priceLimit?.trim() ? req.priceLimit.replace(/[^\d.]/g, "") : "0"}
                inputMode="decimal"
                className="h-8 rounded-lg px-2 text-sm"
              />
            </div>
          </div>
          <div className="w-28">
            <p className="mb-1 text-[11px] font-medium text-muted">Deposit</p>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted">$</span>
              <Input
                value={editDeposit}
                onChange={(e) => setEditDeposit(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="h-8 rounded-lg px-2 text-sm"
              />
            </div>
          </div>
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={saveCharges}>
            Save
          </Button>
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setEditingCharges(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      <PortalTableDetailActions>
        {req.status === "pending" ? (
          <>
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN_PRIMARY}
              onClick={() => {
                const price = (editPrice.trim() || req.price?.trim()) ?? "";
                if (!price) {
                  showToast("Set a service fee before approving.");
                  return;
                }
                if (price !== req.price?.trim() || editDeposit.trim() !== (req.deposit ?? "")) {
                  updateServiceRequest(req.id, {
                    price,
                    deposit: editDeposit.trim(),
                  });
                }
                approveServiceRequest(req.id);
                onUpdated();
                onApproved?.();
                showToast(`Approved "${req.offerName}".`);
              }}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              onClick={() => {
                denyServiceRequest(req.id);
                onUpdated();
                onDenied?.();
                showToast("Request denied.");
              }}
            >
              Deny
            </Button>
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              data-attr="service-request-edit-charges"
              onClick={() => setEditingCharges(true)}
            >
              Edit payment
            </Button>
          </>
        ) : null}
        {allowDelete ? (
          <Button
            type="button"
            variant="outline"
            className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
            onClick={() => {
              if (!window.confirm("Delete this request? This cannot be undone.")) return;
              deleteServiceRequest(req.id);
              onUpdated();
              onCollapsed?.();
              showToast("Request deleted.");
            }}
          >
            Delete
          </Button>
        ) : null}
      </PortalTableDetailActions>
    </>
  );
}
