/**
 * Presentational crop of manager Applications (`ManagerApplications`):
 * title + Edit/Invite, Pending/Approved/Rejected pills, Linear-style rows
 * with inline expand chevron, status Badge, and detail actions.
 *
 * Keep portal-faithful — do not invent Lease-draft / URL-bar chrome.
 */
export function ApplicationsPipelinePanel() {
  return (
    <div className="lp-pipe-frame" aria-hidden>
      <div className="lp-pipe">
        <div className="lp-pipe-chrome">
          <span className="lp-pipe-nav">Manager · Applications</span>
        </div>

        <div className="lp-pipe-body">
          <div className="lp-pipe-head">
            <h3 className="lp-pipe-title">Applications</h3>
            <div className="lp-pipe-actions">
              <span className="lp-pipe-hdr-btn">
                Edit
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                  <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="lp-pipe-hdr-btn">Invite</span>
            </div>
          </div>

          <div className="lp-pipe-filters">
            <div className="lp-pipe-pills" role="presentation">
              <span className="lp-pipe-pill lp-pipe-pill-on">
                Pending
                <span className="lp-pipe-count">2</span>
              </span>
              <span className="lp-pipe-pill">
                Approved
                <span className="lp-pipe-count">1</span>
              </span>
              <span className="lp-pipe-pill">
                Rejected
                <span className="lp-pipe-count">0</span>
              </span>
            </div>
            <span className="lp-pipe-prop">All your properties</span>
          </div>

          <div className="lp-pipe-list">
            <PipeRow
              initials="MC"
              name="Maya Chen"
              subtitle="Cascade Lofts · 4B"
              status="Screening"
              statusTone="pending"
            />
            <PipeRow
              initials="PN"
              name="Priya Nair"
              subtitle="Cascade Lofts · 4B"
              status="New"
              statusTone="info"
              expanded
            />
            <PipeRow
              initials="JL"
              name="Jordan Lee"
              subtitle="Ballard Commons · 2A"
              status="In progress"
              statusTone="neutral"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PipeRow({
  initials,
  name,
  subtitle,
  status,
  statusTone,
  expanded,
}: {
  initials: string;
  name: string;
  subtitle: string;
  status: string;
  statusTone: "pending" | "info" | "neutral" | "confirmed";
  expanded?: boolean;
}) {
  return (
    <div className={`lp-pipe-item${expanded ? " lp-pipe-item-open" : ""}`}>
      <div className="lp-pipe-row">
        <span className="lp-pipe-avatar">{initials}</span>
        <div className="lp-pipe-applicant">
          <span className="lp-pipe-name">
            {name}
            <svg className="lp-pipe-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              {expanded ? (
                <path
                  d="M4 6l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M6 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
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
            <span className="lp-pipe-action lp-pipe-action-danger">Delete</span>
          </div>
          <div className="lp-pipe-section">
            <span className="lp-pipe-section-title">
              Application
              <svg className="lp-pipe-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <path
                  d="M6 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="lp-pipe-section-hint">PDF preview</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
