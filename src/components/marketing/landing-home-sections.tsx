import Link from "next/link";
import { ApplicationsPipelinePanel } from "@/components/marketing/landing-applications-pipeline";
import { LandingDashboardChatDemo } from "@/components/marketing/landing-dashboard-chat-demo";
import "./landing-proplane.css";

const GET_STARTED = "/auth/create-account?mode=create&role=manager";
const BOOK_DEMO = "/contact";

/** Dashboard+assistant demo, learn guides, week pipeline, ops band, closing CTA. */
export function LandingHomeSections() {
  return (
    <>
      <LandingDashboardChatDemo />
      <LearnSection />
      <WeekRoadmapSection />
      <OpsSkySection />
      <ClosingCta />
    </>
  );
}

function CtaPair({
  primaryAttr,
  secondaryAttr,
  primaryClass = "lp-btn lp-btn-blue",
  secondaryClass = "lp-btn lp-btn-ghost",
}: {
  primaryAttr: string;
  secondaryAttr: string;
  primaryClass?: string;
  secondaryClass?: string;
}) {
  return (
    <div className="lp-cta-row">
      <Link href={GET_STARTED} data-attr={primaryAttr} className={primaryClass}>
        Get started
      </Link>
      <Link href={BOOK_DEMO} data-attr={secondaryAttr} className={secondaryClass}>
        Book a demo
      </Link>
    </div>
  );
}

function LearnSection() {
  return (
    <section id="learn" className="lp-learn lp-blueprint scroll-mt-20">
      <div className="lp-w">
        <h2>Learn how to manage your house</h2>
        <p className="lp-lede">
          Short guides for automating messages and tours — then PropLane turns each step into tasks you
          approve.
        </p>
        <div className="lp-chapters">
          <article className="lp-chapter">
            <div className="lp-cap">
              <div className="lp-lab">Guide 01</div>
              <h3>How to automate messages</h3>
            </div>
            <div className="lp-art lp-art-messages" />
          </article>
          <article className="lp-chapter">
            <div className="lp-cap">
              <div className="lp-lab">Guide 02</div>
              <h3>How to automate tours</h3>
            </div>
            <div className="lp-art lp-art-tours" />
          </article>
          <div className="lp-frost">
            <div className="lp-bar">
              <Link href="/why-proplane" data-attr="home-learn-guide" className="lp-pill-cta">
                See automation in PropLane <span className="lp-ico">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WeekRoadmapSection() {
  return (
    <section id="roadmap" className="lp-feature-band scroll-mt-20">
      <div className="lp-w">
        <div className="lp-intro">
          <h2>Your week, one pipeline</h2>
          <p>You approve. PropLane advances the rest.</p>
          <CtaPair primaryAttr="home-roadmap-start" secondaryAttr="home-roadmap-book-demo" />
        </div>
        <div className="lp-split-feat">
          <div className="lp-copy">
            <div className="lp-icon-box" aria-hidden>
              <span className="lp-icon-mark" />
            </div>
            <h3>Tour to keys — same flow</h3>
            <Link href="/why-proplane" data-attr="home-roadmap-leasing" className="lp-more">
              See leasing workflows →
            </Link>
          </div>
          <ApplicationsPipelinePanel />
        </div>
      </div>
    </section>
  );
}

function OpsSkySection() {
  return (
    <section className="lp-ops-sky">
      <div className="lp-deco" aria-hidden>
        <div className="lp-pins">
          <span className="lp-p1" />
          <span className="lp-p2" />
          <span className="lp-p3" />
          <span className="lp-p4" />
        </div>
        <div className="lp-cityscape">
          <div className="lp-b lp-b1" />
          <div className="lp-b lp-b2" />
          <div className="lp-b lp-b3" />
          <div className="lp-b lp-b4" />
          <div className="lp-b lp-b5" />
          <div className="lp-b lp-b6" />
          <div className="lp-b lp-b7" />
          <div className="lp-b lp-b8" />
        </div>
      </div>
      <h2>All the tools your portfolio needs</h2>
      <p className="lp-sub">
        Approvals, background work, and building-level context — tuned for property ops, not a jungle backdrop.
      </p>
      <div className="lp-controls">
        <div className="lp-pt">You approve every outbound action</div>
        <div className="lp-pt lp-on">Rent, leases &amp; work orders run in the background</div>
        <div className="lp-pt">Customize per building and vendor</div>
      </div>
      <div className="lp-task-float">
        <TaskFloatRow status="review" label="Ready to review" title="Lease packet · Cascade 4B" agent="Leasing" />
        <TaskFloatRow status="run" label="Running" title="Rent reminder · April overdue" agent="Rent" />
        <TaskFloatRow status="done" label="Completed" title="Work order #142 · bids collected" agent="Vendors" />
      </div>
    </section>
  );
}

function TaskFloatRow({
  status,
  label,
  title,
  agent,
}: {
  status: "review" | "run" | "done";
  label: string;
  title: string;
  agent: string;
}) {
  return (
    <div className="lp-row">
      <span className={`lp-status lp-${status}`}>{label}</span>
      <div className="lp-meta">
        <div className="lp-title">{title}</div>
      </div>
      <span className="lp-agent">{agent}</span>
    </div>
  );
}

function ClosingCta() {
  return (
    <section className="lp-end">
      <h2>Start managing with PropLane</h2>
      <p>
        Free to begin. Built for the managers behind <b>10 properties</b> and <b>30 residents</b>.
      </p>
      <CtaPair
        primaryAttr="home-closing-get-started"
        secondaryAttr="home-closing-book-demo"
        primaryClass="lp-btn lp-btn-blue lp-lg"
        secondaryClass="lp-btn lp-btn-ghost lp-lg"
      />
    </section>
  );
}
