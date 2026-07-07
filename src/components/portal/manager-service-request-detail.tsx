"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { sanitizeMoneyInput } from "@/lib/listing-form-inputs";
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

function moneyFieldValue(raw: string): string {
  return sanitizeMoneyInput(raw.replace(/^\$/, ""));
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
  const [editPrice, setEditPrice] = useState(() => moneyFieldValue(req.price ?? ""));
  const [editDeposit, setEditDeposit] = useState(() => moneyFieldValue(req.deposit ?? ""));

  useEffect(() => {
    setEditPrice(moneyFieldValue(req.price ?? ""));
    setEditDeposit(moneyFieldValue(req.deposit ?? ""));
    setEditingCharges(false);
  }, [req.id, req.price, req.deposit]);

  useEffect(() => {
    if (!editingCharges) return;
    const el = document.getElementById(`service-request-price-${req.id}`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, [editingCharges, req.id]);

  const chargesSummary = managerServiceRequestPricingSummary(req);
  const depositSummary = needsReturn && req.deposit?.trim() ? req.deposit.trim() : null;

  const cancelEditing = () => {
    setEditPrice(moneyFieldValue(req.price ?? ""));
    setEditDeposit(moneyFieldValue(req.deposit ?? ""));
    setEditingCharges(false);
  };

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
        {req.status === "pending" && editingCharges ? (
          <div className="grid gap-3 pt-1 sm:max-w-md sm:grid-cols-2">
            <div>
              <label
                htmlFor={`service-request-price-${req.id}`}
                className="mb-1 block text-xs font-medium text-muted"
              >
                Charges
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">
                  $
                </span>
                <Input
                  id={`service-request-price-${req.id}`}
                  value={editPrice}
                  onChange={(e) => setEditPrice(sanitizeMoneyInput(e.target.value))}
                  placeholder={req.priceLimit?.trim() ? moneyFieldValue(req.priceLimit) : "0"}
                  inputMode="decimal"
                  className="pl-8 tabular-nums"
                  aria-label="Service fee"
                />
              </div>
            </div>
            {needsReturn || editDeposit.trim() ? (
              <div>
                <label
                  htmlFor={`service-request-deposit-${req.id}`}
                  className="mb-1 block text-xs font-medium text-muted"
                >
                  Deposit
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">
                    $
                  </span>
                  <Input
                    id={`service-request-deposit-${req.id}`}
                    value={editDeposit}
                    onChange={(e) => setEditDeposit(sanitizeMoneyInput(e.target.value))}
                    placeholder="0"
                    inputMode="decimal"
                    className="pl-8 tabular-nums"
                    aria-label="Deposit"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p>
            Charges:{" "}
            <span className="tabular-nums text-foreground">
              {chargesSummary}
              {depositSummary ? (
                <>
                  {" "}
                  · Deposit: {depositSummary}
                </>
              ) : null}
            </span>
          </p>
        )}
        {showDescription ? <p className="pt-1">{description}</p> : null}
        {req.priceLimit?.trim() && !req.price?.trim() ? (
          <p>
            Resident price limit: <span className="font-semibold text-foreground">{req.priceLimit.trim()}</span>
          </p>
        ) : null}
        {req.notes ? <p className="italic">&ldquo;{req.notes}&rdquo;</p> : null}
      </div>

      <PortalTableDetailActions>
        {req.status === "pending" ? (
          <>
            <Button
              type="button"
              variant="primary"
              className={PORTAL_DETAIL_BTN}
              onClick={() => {
                const price = (editPrice.trim() || moneyFieldValue(req.price ?? "")) ?? "";
                if (!price) {
                  showToast("Set a service fee before approving.");
                  return;
                }
                if (price !== moneyFieldValue(req.price ?? "") || editDeposit.trim() !== moneyFieldValue(req.deposit ?? "")) {
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
            {editingCharges ? (
              <>
                <Button type="button" variant="primary" className={PORTAL_DETAIL_BTN} onClick={saveCharges}>
                  Save
                </Button>
                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={cancelEditing}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="service-request-edit-charges"
                onClick={() => setEditingCharges(true)}
              >
                Edit
              </Button>
            )}
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
