"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  FormalDocumentScopeBar,
  type FormalDocumentFilterState,
} from "@/components/portal/reports/formal-document-scope-bar";
import {
  ReportFilterBar,
  type ReportFilterState,
} from "@/components/portal/reports/report-filter-bar";

export function ReportGenerateModal({
  open,
  onClose,
  tabLabel,
  showScope,
  showProperty,
  showDateRange,
  showTaxYear,
  propertyOptions,
  filters,
  onFiltersChange,
  scopeFilters,
  onScopeFiltersChange,
  onGenerate,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  tabLabel: string;
  showScope: boolean;
  showProperty: boolean;
  showDateRange: boolean;
  showTaxYear: boolean;
  propertyOptions?: { id: string; label: string }[];
  filters: ReportFilterState;
  onFiltersChange: (next: Partial<ReportFilterState>) => void;
  scopeFilters: FormalDocumentFilterState;
  onScopeFiltersChange: (next: Partial<FormalDocumentFilterState>) => void;
  onGenerate: () => void;
  loading?: boolean;
}) {
  return (
    <Modal open={open} title={`Generate ${tabLabel.toLowerCase()}`} onClose={onClose} panelClassName="max-w-lg">
      <div className="space-y-5">
        <p className="text-sm text-muted">Choose scope and dates, then generate the report.</p>

        {showScope ? (
          <div className="space-y-3">
            <FormalDocumentScopeBar
              inline
              stacked
              filters={scopeFilters}
              onChange={onScopeFiltersChange}
            />
          </div>
        ) : null}

        <ReportFilterBar
          stacked
          showProperty={showProperty}
          showDateRange={showDateRange}
          showDaysAhead={false}
          showTaxYear={showTaxYear}
          showRunButton={false}
          propertyOptions={propertyOptions}
          filters={filters}
          onChange={onFiltersChange}
          onRun={onGenerate}
          loading={loading}
        />

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className={PORTAL_HEADER_ACTION_BTN}
            onClick={onGenerate}
            disabled={loading}
            data-attr="documents-generate-report-submit"
          >
            {loading ? "Generating…" : "Generate report"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
