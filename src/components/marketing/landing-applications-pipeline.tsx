/**
 * Homepage week-band mock: focused Applications → lease-approve moment.
 * Marketing composition (not a 1:1 portal clone): pending + lease draft approve.
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
          <span className="lp-pipe-live">2 need review</span>
        </div>

        <div className="lp-pipe-body">
          <div className="lp-pipe-head">
            <div>
              <p className="lp-pipe-kicker">Applications</p>
              <p className="lp-pipe-heading">Manager pipeline</p>
            </div>
            <span className="lp-pipe-live lp-pipe-live-inline">Lease ready</span>
          </div>

          <div className="lp-pipe-toolbar">
            <span className="lp-pipe-pill">Pending · 1</span>
            <span className="lp-pipe-pill lp-pipe-pill-on">Lease draft · 1</span>
            <span className="lp-pipe-pill">All</span>
          </div>

          <div className="lp-pipe-table">
            <div className="lp-pipe-thead">
              <span>Applicant</span>
              <span>Unit</span>
              <span>Status</span>
              <span>Next</span>
            </div>

            <PipeRow
              name="Maya Chen"
              meta="Income verified"
              unit="Cascade 4B"
              status="Pending"
              statusTone="pending"
              next="Review"
            />
            <PipeRow
              name="Priya Nair"
              meta="Screening clear"
              unit="Cascade 4B"
              status="Approved"
              statusTone="success"
              next="Approve lease"
              highlight
            />
          </div>

          <div className="lp-pipe-lease">
            <div className="lp-pipe-lease-head">
              <span className="lp-pipe-lease-mark" aria-hidden>
                ✦
              </span>
              <div className="min-w-0 flex-1">
                <p className="lp-pipe-lease-title">Lease draft · Priya Nair</p>
                <p className="lp-pipe-lease-sub">Cascade 4B · 12 mo · $2,450</p>
              </div>
              <span className="lp-pipe-badge lp-pipe-badge-approve">Needs approval</span>
            </div>
            <div className="lp-pipe-lease-actions">
              <span className="lp-pipe-action lp-pipe-action-ghost">Edit terms</span>
              <span className="lp-pipe-action lp-pipe-action-primary">Approve &amp; send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PipeRow({
  name,
  meta,
  unit,
  status,
  statusTone,
  next,
  highlight,
}: {
  name: string;
  meta: string;
  unit: string;
  status: string;
  statusTone: "pending" | "success" | "info";
  next: string;
  highlight?: boolean;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div className={`lp-pipe-row${highlight ? " lp-pipe-row-hl" : ""}`}>
      <div className="lp-pipe-applicant">
        <span className="lp-pipe-avatar" aria-hidden>
          {initials}
        </span>
        <div className="min-w-0">
          <span className="lp-pipe-name">{name}</span>
          <span className="lp-pipe-meta">{meta}</span>
        </div>
      </div>
      <span className="lp-pipe-unit">{unit}</span>
      <span className={`lp-pipe-badge lp-pipe-badge-${statusTone}`}>{status}</span>
      <span className="lp-pipe-next lp-pipe-next-you">{next}</span>
    </div>
  );
}
