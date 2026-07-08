"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEMO_PORTAL_SCROLL_ID } from "@/lib/portal-layout-classes";
import { sleep } from "@/lib/demo/demo-playback";

export type DemoCursorPoint = { x: number; y: number };

export type DemoCursorClickOptions = {
  /** Align footer actions near the bottom of the demo frame before clicking. */
  align?: "center" | "end";
};

type Point = DemoCursorPoint;

type DemoCursorWindow = Window & {
  __axisDemoCursorClick?: (selector: string, options?: DemoCursorClickOptions) => Promise<void>;
  __axisDemoCursorMoveTo?: (point: Point) => Promise<void>;
};

const CURSOR_VIEW_PADDING = 56;

function centerOf(el: Element, root: HTMLElement): Point {
  const rect = el.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left + rect.width / 2,
    y: rect.top - rootRect.top + rect.height / 2,
  };
}

function clampPointToFrame(point: Point, frame: HTMLElement): Point {
  const pad = 12;
  return {
    x: Math.min(Math.max(point.x, pad), frame.clientWidth - pad),
    y: Math.min(Math.max(point.y, pad), frame.clientHeight - pad),
  };
}

function collectScrollRevealAdjustments(
  el: Element,
  frame: HTMLElement,
  padding = CURSOR_VIEW_PADDING,
): { el: HTMLElement; delta: number }[] {
  const adjustments: { el: HTMLElement; delta: number }[] = [];
  let node: Element | null = el;
  while (node && frame.contains(node)) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      const scrollable =
        (style.overflowY === "auto" || style.overflowY === "scroll" || style.overflow === "auto") &&
        node.scrollHeight > node.clientHeight + 2;
      if (scrollable) {
        const nodeRect = node.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        let delta = 0;
        if (elRect.bottom > nodeRect.bottom - padding) {
          delta += elRect.bottom - nodeRect.bottom + padding;
        }
        if (elRect.top < nodeRect.top + padding) {
          delta -= nodeRect.top + padding - elRect.top;
        }
        if (Math.abs(delta) > 1) adjustments.push({ el: node, delta });
      }
    }
    node = node.parentElement;
  }

  const frameScroll = frame.querySelector(`#${DEMO_PORTAL_SCROLL_ID}`) as HTMLElement | null;
  if (frameScroll?.contains(el)) {
    const frameRect = frame.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetCenter = elRect.top + elRect.height / 2;
    const frameCenter = frameRect.top + frameRect.height / 2;
    const delta = targetCenter - frameCenter;
    if (Math.abs(delta) > padding / 2) {
      adjustments.push({ el: frameScroll, delta });
    }
  }
  return adjustments;
}

async function animateScrollAdjustments(
  adjustments: { el: HTMLElement; delta: number }[],
  durationMs = 480,
): Promise<void> {
  if (!adjustments.length) return;
  const starts = adjustments.map((a) => a.el.scrollTop);
  const started = performance.now();
  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = easeInOutCubic(Math.min(1, (now - started) / durationMs));
      adjustments.forEach((a, i) => {
        a.el.scrollTop = starts[i]! + a.delta * t;
      });
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function revealTargetInFrame(
  target: Element,
  frame: HTMLElement,
  align: "center" | "end" = "center",
): Promise<void> {
  const adjustments = collectScrollRevealAdjustments(target, frame);
  if (adjustments.length > 0) {
    await animateScrollAdjustments(adjustments, align === "end" ? 520 : 560);
  } else {
    (target as HTMLElement).scrollIntoView({
      block: align === "end" ? "end" : "center",
      inline: "nearest",
      behavior: "smooth",
    });
    await sleep(align === "end" ? 420 : 480);
  }
  await sleep(140);
}

function keepCursorInFrame(frame: HTMLElement, point: Point): void {
  const pad = CURSOR_VIEW_PADDING;
  let scrollDelta = 0;
  if (point.y > frame.clientHeight - pad) {
    scrollDelta = point.y - frame.clientHeight + pad;
  } else if (point.y < pad) {
    scrollDelta = point.y - pad;
  }
  if (scrollDelta === 0) return;

  const frameScroll = frame.querySelector(`#${DEMO_PORTAL_SCROLL_ID}`) as HTMLElement | null;
  frameScroll?.scrollBy({ top: scrollDelta, behavior: "auto" });

  for (const overlay of frame.querySelectorAll(".modal-overlay")) {
    if (overlay instanceof HTMLElement && overlay.scrollHeight > overlay.clientHeight + 2) {
      overlay.scrollBy({ top: scrollDelta, behavior: "auto" });
    }
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function pointOnQuadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function arcControlPoint(from: Point, to: Point): Point {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(56, dist * 0.22) * (from.x < to.x ? 1 : -1);
  return {
    x: mid.x - (dy / dist) * bow,
    y: mid.y + (dx / dist) * bow * 0.65,
  };
}

function travelDurationMs(from: Point, to: Point): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.min(920, Math.max(380, dist * 0.9));
}

function animatePoint(
  from: Point,
  to: Point,
  durationMs: number,
  frame: HTMLElement,
  onFrame: (p: Point) => void,
  onMoving?: (moving: boolean) => void,
): Promise<void> {
  const control = arcControlPoint(from, to);
  onMoving?.(true);
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = (now: number) => {
      const t = easeInOutCubic(Math.min(1, (now - started) / durationMs));
      const point = pointOnQuadraticBezier(from, control, to, t);
      onFrame(clampPointToFrame(point, frame));
      if (t < 1) requestAnimationFrame(tick);
      else {
        keepCursorInFrame(frame, pointOnQuadraticBezier(from, control, to, 1));
        onFrame(clampPointToFrame(pointOnQuadraticBezier(from, control, to, 1), frame));
        onMoving?.(false);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

function playDemoClickSound(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const click = ctx.createBufferSource();
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    click.buffer = noiseBuffer;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2200;
    band.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    click.connect(band);
    band.connect(gain);
    gain.connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.08);

    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(520, now);
    tone.frequency.exponentialRampToValueAtTime(280, now + 0.05);
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.06, now + 0.003);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    tone.connect(toneGain);
    toneGain.connect(ctx.destination);
    tone.start(now);
    tone.stop(now + 0.07);

    window.setTimeout(() => void ctx.close(), 120);
  } catch {
    /* autoplay policy or unsupported */
  }
}

function DemoCursorLayer({
  container,
  position,
  clicking,
  moving,
}: {
  container: HTMLElement;
  position: Point | null;
  clicking: boolean;
  moving: boolean;
}) {
  if (!position) return null;
  const scale = clicking ? 0.88 : moving ? 0.96 : 1;
  const rotate = moving ? -4 : 0;
  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[20000] overflow-hidden" aria-hidden>
      <div
        className="absolute will-change-[left,top,transform]"
        style={{
          left: position.x,
          top: position.y,
          transform: `rotate(${rotate}deg) scale(${scale})`,
          transition: clicking ? "transform 90ms ease-out" : moving ? "transform 60ms linear" : "transform 140ms ease-out",
        }}
      >
        {clicking ? (
          <span
            className="absolute left-0 top-0 size-8 rounded-full border-2 border-black/25 bg-white/10"
            style={{ animation: "demo-cursor-ripple 380ms ease-out forwards" }}
          />
        ) : null}
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          aria-hidden
        >
          <g transform="translate(-5.5,-3.2)">
            <path
              d="M5.5 3.21 17.52 11.78l-5.4 1.35 2.7 6.75-2.25.9-2.7-6.75-5.07 1.27z"
              fill="#ffffff"
              stroke="#111111"
              strokeWidth="2.15"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <style>{`
        @keyframes demo-cursor-ripple {
          0% { transform: scale(0.35); opacity: 0.95; }
          100% { transform: scale(1.65); opacity: 0; }
        }
      `}</style>
    </div>,
    container,
  );
}

export function DemoCursorPlayback({ container }: { container: HTMLElement | null }) {
  const [position, setPosition] = useState<Point | null>(null);
  const [clicking, setClicking] = useState(false);
  const [moving, setMoving] = useState(false);
  const runningRef = useRef(false);
  const lastPosRef = useRef<Point | null>(null);

  useEffect(() => {
    if (!container) return;

    const animateMoveTo = async (end: Point) => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const start = clampPointToFrame(
          lastPosRef.current ??
            ({
              x: Math.min(Math.max(end.x + 48, 16), container.clientWidth - 16),
              y: Math.min(Math.max(end.y + 32, 16), container.clientHeight - 16),
            } satisfies Point),
          container,
        );
        const target = clampPointToFrame(end, container);
        setClicking(false);
        setPosition(start);
        await sleep(30);
        await animatePoint(start, target, travelDurationMs(start, target), container, setPosition, setMoving);
        lastPosRef.current = target;
      } finally {
        runningRef.current = false;
        setMoving(false);
      }
    };

    const animateClick = async (selector: string, options?: DemoCursorClickOptions) => {
      if (runningRef.current) return;
      let target = container.querySelector(selector);
      if (!target) return;
      runningRef.current = true;
      try {
        const align = options?.align ?? "center";
        await revealTargetInFrame(target, container, align);
        target = container.querySelector(selector) ?? target;

        const end = clampPointToFrame(centerOf(target, container), container);
        const start = clampPointToFrame(
          lastPosRef.current ??
            ({
              x: Math.min(Math.max(end.x + 64, 16), container.clientWidth - 16),
              y: Math.min(Math.max(end.y + 40, 16), container.clientHeight - 16),
            } satisfies Point),
          container,
        );

        setClicking(false);
        setPosition(start);
        await sleep(50);

        await animatePoint(start, end, travelDurationMs(start, end), container, setPosition, setMoving);
        await sleep(80);

        target = container.querySelector(selector) ?? target;
        const clickPoint = clampPointToFrame(centerOf(target, container), container);
        setPosition(clickPoint);

        setClicking(true);
        playDemoClickSound();
        await sleep(100);
        (target as HTMLElement).click();
        await sleep(140);
        setClicking(false);

        lastPosRef.current = clickPoint;
        await sleep(120);
      } finally {
        runningRef.current = false;
        setMoving(false);
      }
    };

    const win = window as DemoCursorWindow;
    win.__axisDemoCursorClick = animateClick;
    win.__axisDemoCursorMoveTo = animateMoveTo;

    return () => {
      delete win.__axisDemoCursorClick;
      delete win.__axisDemoCursorMoveTo;
      lastPosRef.current = null;
      setPosition(null);
      setClicking(false);
      setMoving(false);
    };
  }, [container]);

  if (!container) return null;
  return <DemoCursorLayer container={container} position={position} clicking={clicking} moving={moving} />;
}

export async function demoCursorClick(selector: string, options?: DemoCursorClickOptions): Promise<boolean> {
  const fn = (window as DemoCursorWindow).__axisDemoCursorClick;
  if (!fn) return false;
  await fn(selector, options);
  return true;
}

export async function demoCursorMoveTo(point: DemoCursorPoint): Promise<boolean> {
  const fn = (window as DemoCursorWindow).__axisDemoCursorMoveTo;
  if (!fn) return false;
  await fn(point);
  return true;
}
