import Image from "next/image";
import Link from "next/link";
import { ApplicationsPipelinePanel } from "@/components/marketing/landing-applications-pipeline";
import { LandingDashboardChatDemo } from "@/components/marketing/landing-dashboard-chat-demo";
import { BOOK_DEMO_HREF, MANAGER_GET_STARTED_HREF } from "@/lib/marketing/public-contact";
import "./landing-proplane.css";

const GET_STARTED = MANAGER_GET_STARTED_HREF;

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
      <Link href={BOOK_DEMO_HREF} data-attr={secondaryAttr} className={secondaryClass}>
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
            <div className="lp-art lp-art-messages">
              <Image
                src="/marketing/guide-messages.webp"
                alt="PropLane Communication → Schedule tab: automated rent, tour, and renewal messages queued on upcoming send dates"
                fill
                sizes="(max-width: 700px) 100vw, 460px"
                className="lp-art-img"
              />
            </div>
          </article>
          <article className="lp-chapter">
            <div className="lp-cap">
              <div className="lp-lab">Guide 02</div>
              <h3>How to automate tours</h3>
            </div>
            <div className="lp-art lp-art-tours">
              <Image
                src="/marketing/guide-tours.webp"
                alt="PropLane Calendar availability week: open self-scheduling tour slots alongside tours prospects have already booked"
                fill
                sizes="(max-width: 700px) 100vw, 460px"
                className="lp-art-img"
              />
            </div>
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

const PORTFOLIO_BUILDINGS = ["Cascade Lofts", "Ballard Commons", "Cascade Court"] as const;

function BuildingIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M3.5 13.5V3.75a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 .75.75V13.5M9.5 13.5V6.75a.75.75 0 0 1 .75-.75h1.75a.75.75 0 0 1 .75.75v6.75M2.5 13.5h11.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 5.25h1M5 7.5h1M5 9.75h1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
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
      </div>
      <h2>All the tools your portfolio needs</h2>
      <div className="lp-controls">
        <div className="lp-pt">You approve every outbound action</div>
        <div className="lp-pt lp-on">Rent, leases &amp; work orders run in the background</div>
        <div className="lp-pt">Customize per building and vendor</div>
      </div>
      <div className="lp-task-float">
        <TaskFloatRow status="review" label="Manager review" title="Lease · Cascade 4B" agent="Leases" />
        <TaskFloatRow status="run" label="Running" title="Rent reminder · April overdue" agent="Payments" />
        <TaskFloatRow status="done" label="Completed" title="Work order #142 · bids collected" agent="Work orders" />
      </div>
      <div className="lp-portfolio-strip" aria-hidden>
        {PORTFOLIO_BUILDINGS.map((name) => (
          <span key={name} className="lp-portfolio-chip">
            <BuildingIcon />
            {name}
          </span>
        ))}
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
        Free to begin with your first listing. Scales up to a <b>20-property</b> portfolio with residents,
        leases, and a full team as you grow.
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
