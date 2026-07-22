/**
 * Homepage week-band mock of the manager Applications portal.
 *
 * Copy and structure mirror `src/components/portal/manager-applications.tsx`:
 * the "Applications" page title + Invite action, the Pending / Approved /
 * Rejected status pills with counts plus the property filter pill, applicant
 * rows (avatar initials, name with inline chevron, "property · room"
 * subtitle, status badge from `applicationStatusPill`), and one expanded row
 * showing the real Approve / Reject / Send reminder actions and the Checkr
 * screening chip. Every label here exists in the portal — do not invent copy.
 *
 * All three rows sit in the Pending bucket, so their badges are pending-bucket
 * ones (New / Screening / Screened) — never Approved, which lives on its own tab.
 */
import "./landing-applications-pipeline.css";

export function ApplicationsPipelinePanel() {
  return (
    <div className="lp-pipe-frame" aria-hidden>
      <div className="lp-pipe">
        <div className="lp-pipe-chrome">
          <span className="lp-pipe-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="lp-pipe-url">proplane.app/applications</span>
        </div>

        <div className="lp-pipe-body">
          <div className="lp-pipe-head">
            <p className="lp-pipe-heading">Applications</p>
            <span className="lp-pipe-head-action">Invite</span>
          </div>

          <div className="lp-pipe-toolbar">
            <span className="lp-pipe-pill lp-pipe-pill-on">
              Pending <span className="lp-pipe-count">3</span>
            </span>
            <span className="lp-pipe-pill">
              Approved <span className="lp-pipe-count">4</span>
            </span>
            <span className="lp-pipe-pill">
              Rejected <span className="lp-pipe-count">1</span>
            </span>
            <span className="lp-pipe-pill lp-pipe-pill-filter">All properties</span>
          </div>

          <div className="lp-pipe-table">
            <PipeRow name="Maya Chen" subtitle="Cascade Lofts · Room 4B" status="Screened" statusTone="info" />
            <PipeRow
              name="Priya Nair"
              subtitle="Cascade Lofts · Room 2A"
              status="Screening"
              statusTone="pending"
              expanded
            />
            <PipeRow name="Dev Ramos" subtitle="Ballard Commons · Room 1C" status="New" statusTone="info" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PipeRow({
  name,
  subtitle,
  status,
  statusTone,
  expanded,
}: {
  name: string;
  subtitle: string;
  status: string;
  statusTone: "pending" | "success" | "info";
  expanded?: boolean;
}) {
  const parts = name.trim().split(/\s+/);
  const initials = `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`;

  return (
    <div className={`lp-pipe-item${expanded ? " lp-pipe-item-open" : ""}`}>
      <div className="lp-pipe-row">
        <span className="lp-pipe-avatar">{initials}</span>
        <div className="lp-pipe-applicant">
          <span className="lp-pipe-name">
            {name}
            <span className={`lp-pipe-chev${expanded ? " lp-pipe-chev-open" : ""}`}>›</span>
          </span>
          <span className="lp-pipe-meta">{subtitle}</span>
        </div>
        <span className={`lp-pipe-badge lp-pipe-badge-${statusTone}`}>{status}</span>
      </div>

      {expanded ? (
        <div className="lp-pipe-detail">
          <div className="lp-pipe-detail-actions">
            <span className="lp-pipe-action lp-pipe-action-primary">Approve</span>
            <span className="lp-pipe-action lp-pipe-action-ghost">Reject</span>
            <span className="lp-pipe-action lp-pipe-action-ghost">Send reminder</span>
          </div>
          <div className="lp-pipe-detail-screening">
            <span className="lp-pipe-detail-label">Screening</span>
            <span className="lp-pipe-chip">Checkr: Pending</span>
            <span className="lp-pipe-detail-link">Run screening</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
