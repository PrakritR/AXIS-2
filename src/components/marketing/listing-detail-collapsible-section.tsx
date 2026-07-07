"use client";

import { useState, type ReactNode } from "react";

export const listingSectionScrollClass =
  "scroll-mt-[var(--listing-sticky-stack,calc(env(safe-area-inset-top,0px)+9.5rem))]";

export const listingSectionCardClass =
  "rounded-2xl border border-border bg-card shadow-sm backdrop-blur-sm";

const viewPillClass =
  "flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-accent/35 px-4 py-1.5 text-sm font-semibold text-foreground transition hover:bg-accent/50";

function CollapseChevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ViewToggleButton({
  open,
  onClick,
  dataAttr,
  className = "",
}: {
  open: boolean;
  onClick: () => void;
  dataAttr?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-attr={dataAttr}
      aria-expanded={open}
      className={`${viewPillClass} ${className}`}
    >
      {open ? "Hide" : "View"}
      <CollapseChevron open={open} />
    </button>
  );
}

export function ListingDetailCollapsibleSection({
  id,
  title,
  eyebrow,
  headerAside,
  children,
  collapseOnMobile = true,
  dataAttrToggle,
  className = "",
  contentClassName = "",
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  headerAside?: ReactNode;
  children: ReactNode;
  /** When true (default), content is collapsed on small screens; md+ always expanded. */
  collapseOnMobile?: boolean;
  dataAttrToggle?: string;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const mobileContentClass = collapseOnMobile
    ? open
      ? "block"
      : "hidden md:block"
    : "block";

  return (
    <section id={id} className={`${listingSectionScrollClass} ${className}`}>
      <div className={`${listingSectionCardClass} p-5 sm:p-7`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
            ) : null}
            <h2
              className={`font-bold tracking-tight text-foreground ${eyebrow ? "mt-1 text-xl sm:text-2xl" : "text-xl sm:text-2xl"}`}
            >
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {headerAside ? <div className="shrink-0">{headerAside}</div> : null}
            {collapseOnMobile ? (
              <ViewToggleButton
                open={open}
                onClick={() => setOpen((v) => !v)}
                dataAttr={dataAttrToggle}
                className="md:hidden"
              />
            ) : null}
          </div>
        </div>
        <div className={`mt-5 sm:mt-6 ${mobileContentClass} ${contentClassName}`}>{children}</div>
      </div>
    </section>
  );
}

/** Title row + View pill (House rules style). Content hidden until expanded on mobile; always visible md+. */
export function ListingDetailCollapsibleSimpleSection({
  id,
  title,
  children,
  emptyMessage,
  hasContent = true,
  dataAttrToggle,
  className = "",
}: {
  id?: string;
  title: string;
  children: ReactNode;
  emptyMessage?: string;
  hasContent?: boolean;
  dataAttrToggle?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section id={id} className={`${listingSectionScrollClass} ${className}`}>
      <div className={`${listingSectionCardClass} p-5 sm:p-7`}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
          {hasContent ? (
            <ViewToggleButton
              open={open}
              onClick={() => setOpen((v) => !v)}
              dataAttr={dataAttrToggle}
              className="md:hidden"
            />
          ) : null}
        </div>
        {!hasContent && emptyMessage ? (
          <p className="mt-4 text-sm leading-relaxed text-muted">{emptyMessage}</p>
        ) : hasContent ? (
          <div className={`mt-5 sm:mt-6 ${open ? "block" : "hidden md:block"}`}>{children}</div>
        ) : null}
      </div>
    </section>
  );
}
