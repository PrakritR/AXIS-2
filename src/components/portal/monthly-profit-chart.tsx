"use client";

import { useMemo, useState } from "react";
import type { MonthlyProfitPoint } from "@/lib/portal-monthly-profit";

function formatUsd(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: abs >= 1000 ? 0 : 2,
  });
  return amount < 0 ? `−${formatted}` : formatted;
}

/**
 * Robinhood-style monthly profit chart: hero number + smooth area line over months.
 */
export function MonthlyProfitChart({
  points,
  title = "Cash flow",
  subtitle = "Profit per month",
  className = "",
}: {
  points: MonthlyProfitPoint[];
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, points.length - 1));
  const active = points[activeIndex] ?? points[points.length - 1];
  const totalProfit = useMemo(() => points.reduce((s, p) => s + p.profit, 0), [points]);
  const hasAny = points.some((p) => p.profit !== 0);

  const chart = useMemo(() => {
    const w = 320;
    const h = 88;
    const padX = 12;
    const padY = 10;
    const profits = points.map((p) => p.profit);
    const minP = Math.min(0, ...profits);
    const maxP = Math.max(0, ...profits);
    const range = Math.max(maxP - minP, 1);
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;
    const yFor = (v: number) => padY + ((maxP - v) / range) * innerH;
    const xFor = (i: number) => padX + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);

    const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.profit), profit: p.profit }));
    const zeroY = yFor(0);

    const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
    const areaD =
      coords.length > 0
        ? `${lineD} L ${coords[coords.length - 1]!.x.toFixed(2)} ${zeroY.toFixed(2)} L ${coords[0]!.x.toFixed(2)} ${zeroY.toFixed(2)} Z`
        : "";

    const trendUp = (active?.profit ?? 0) >= 0;
    const stroke = trendUp ? "var(--status-confirmed-fg)" : "var(--status-overdue-fg)";

    return { w, h, coords, zeroY, lineD, areaD, stroke, padX, innerW };
  }, [points, active?.profit]);

  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 sm:p-5 [html[data-native]_&]:p-3.5 max-lg:p-3 ${className}`}
      data-attr="monthly-profit-chart"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.07em] text-muted/70">{subtitle}</p>
        </div>
        <p className="text-[11px] tabular-nums text-muted">
          6-mo total{" "}
          <span className={totalProfit >= 0 ? "text-[var(--status-confirmed-fg)]" : "text-[var(--status-overdue-fg)]"}>
            {formatUsd(totalProfit)}
          </span>
        </p>
      </div>

      {active ? (
        <div className="mt-4">
          <p
            className={`text-3xl font-bold tabular-nums tracking-tight sm:text-[2rem] ${
              active.profit >= 0 ? "text-[var(--status-confirmed-fg)]" : "text-[var(--status-overdue-fg)]"
            }`}
            data-attr="monthly-profit-chart-hero"
          >
            {formatUsd(active.profit)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {active.label} profit
          </p>
        </div>
      ) : null}

      {hasAny ? (
        <div className="mt-4">
          <svg
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            className="w-full touch-pan-y"
            role="img"
            aria-label="Monthly profit trend"
          >
            <defs>
              <linearGradient id="monthly-profit-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.stroke} stopOpacity="0.35" />
                <stop offset="100%" stopColor={chart.stroke} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line
              x1={chart.padX}
              x2={chart.w - chart.padX}
              y1={chart.zeroY}
              y2={chart.zeroY}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {chart.areaD ? <path d={chart.areaD} fill="url(#monthly-profit-fill)" /> : null}
            {chart.lineD ? (
              <path d={chart.lineD} fill="none" stroke={chart.stroke} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {chart.coords.map((c, i) => (
              <circle
                key={points[i]!.key}
                cx={c.x}
                cy={c.y}
                r={activeIndex === i ? 4.5 : 3}
                fill={chart.stroke}
                className="transition-[r] duration-150"
              />
            ))}
            {chart.coords.map((c, i) => (
              <rect
                key={`hit-${points[i]!.key}`}
                x={i === 0 ? chart.padX : (chart.coords[i - 1]!.x + c.x) / 2}
                y={0}
                width={
                  i === 0
                    ? (chart.coords[1]?.x ?? c.x) - chart.padX
                    : i === chart.coords.length - 1
                      ? chart.w - chart.padX - (chart.coords[i - 1]!.x + c.x) / 2
                      : (chart.coords[i + 1]!.x - chart.coords[i - 1]!.x) / 2
                }
                height={chart.h}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => setActiveIndex(i)}
              />
            ))}
          </svg>
          <div className="mt-2 flex justify-between gap-1 px-0.5">
            {points.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`min-w-0 flex-1 rounded-md py-1 text-center text-[10px] font-medium transition-colors sm:text-[11px] ${
                  activeIndex === i ? "bg-primary/10 text-foreground" : "text-muted hover:text-foreground"
                }`}
                data-attr={`monthly-profit-month-${p.key}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted [html[data-native]_&]:text-xs">
          No profit data yet. Collected rent minus logged expenses will chart here each month.
        </p>
      )}
    </div>
  );
}
