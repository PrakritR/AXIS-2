"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { PropertyBrowseCard } from "@/lib/room-listings-catalog";

const SWIPE_THRESHOLD_PX = 72;
const EXIT_ANIM_MS = 280;

function formatRent(card: PropertyBrowseCard): string {
  if (card.rentNumeric !== null) {
    return `$${card.rentNumeric.toLocaleString("en-US")}`;
  }
  const stripped = card.priceLabel.replace(/\/month/i, "").trim();
  return stripped || "—";
}

function SwipeCardFace({
  card,
  style,
  dragX,
  exiting,
}: {
  card: PropertyBrowseCard;
  style?: CSSProperties;
  dragX?: number;
  exiting?: "left" | "right" | null;
}) {
  const rent = formatRent(card);
  const isDataUrl = card.imageUrl.startsWith("data:");
  const passOpacity = dragX !== undefined && dragX < -20 ? Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD_PX) : 0;
  const likeOpacity = dragX !== undefined && dragX > 20 ? Math.min(1, dragX / SWIPE_THRESHOLD_PX) : 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-3xl bg-accent/20 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)] ring-1 ring-border/40"
      style={style}
    >
      <div className="relative h-full w-full overflow-hidden">
        <Image
          src={card.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 92vw, 400px"
          unoptimized={isDataUrl}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

        <div
          className="pointer-events-none absolute left-4 top-6 rotate-[-12deg] rounded-lg border-4 border-rose-400 px-3 py-1 text-lg font-extrabold uppercase tracking-wide text-rose-400"
          style={{ opacity: exiting === "left" ? 1 : passOpacity }}
          aria-hidden
        >
          Pass
        </div>
        <div
          className="pointer-events-none absolute right-4 top-6 rotate-[12deg] rounded-lg border-4 border-emerald-400 px-3 py-1 text-lg font-extrabold uppercase tracking-wide text-emerald-400"
          style={{ opacity: exiting === "right" ? 1 : likeOpacity }}
          aria-hidden
        >
          Like
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-sm font-semibold text-white/90">{card.neighborhood}</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight text-white">{card.headlineAddress}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{rent}</p>
          <p className="text-xs font-medium text-white/75">{" / month"}</p>
          {card.petFriendly ? (
            <span className="mt-3 inline-block rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              Pets OK
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HousingBrowseSwipeStack({ cards }: { cards: PropertyBrowseCard[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });

  const cardKey = cards.map((c) => c.propertyId).join(",");
  useEffect(() => {
    setIndex(0);
    setDragX(0);
    setDragY(0);
    setExiting(null);
  }, [cardKey]);

  const current = cards[index];
  const next = cards[index + 1];
  const done = !current;

  const advance = useCallback((direction: "left" | "right") => {
    if (!current) return;
    setExiting(direction);
    const targetX = direction === "left" ? -window.innerWidth * 1.1 : window.innerWidth * 1.1;
    setDragX(targetX);

    window.setTimeout(() => {
      if (direction === "right") {
        router.push(`/rent/listings/${encodeURIComponent(current.propertyId)}`);
      }
      setIndex((i) => i + 1);
      setDragX(0);
      setDragY(0);
      setExiting(null);
    }, EXIT_ANIM_MS);
  }, [current, router]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting || !current) return;
    pointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || pointerIdRef.current !== e.pointerId || exiting) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    setDragX(dx);
    setDragY(dy * 0.25);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setDragging(false);
    if (exiting || !current) return;

    if (dragX > SWIPE_THRESHOLD_PX) {
      advance("right");
      return;
    }
    if (dragX < -SWIPE_THRESHOLD_PX) {
      advance("left");
      return;
    }
    setDragX(0);
    setDragY(0);
  };

  const onPointerCancel = () => {
    pointerIdRef.current = null;
    setDragging(false);
    if (!exiting) {
      setDragX(0);
      setDragY(0);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-[min(62dvh,520px)] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 px-6 py-12 text-center">
        <p className="text-base font-semibold text-foreground">You&apos;ve seen every home</p>
        <p className="mt-2 text-sm text-muted">Adjust filters or check back when new listings go live.</p>
        <button
          type="button"
          onClick={() => setIndex(0)}
          data-attr="resident-browse-restart-swipe"
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          Start over
        </button>
      </div>
    );
  }

  const rotate = dragX * 0.06;
  const transition = dragging ? "none" : `transform ${EXIT_ANIM_MS}ms ease-out`;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative mx-auto w-full max-w-[min(100%,22rem)] touch-none select-none"
        style={{ height: "min(62dvh, 520px)" }}
        aria-label="Swipe homes — right to view, left to pass"
      >
        {next ? (
          <div className="absolute inset-0 scale-[0.96] opacity-90" aria-hidden>
            <SwipeCardFace card={next} />
          </div>
        ) : null}

        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${dragX}px, ${dragY}px) rotate(${rotate}deg)`,
            transition,
            zIndex: 2,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          data-attr="resident-browse-swipe-card"
        >
          <SwipeCardFace card={current} dragX={dragX} exiting={exiting} />
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        {index + 1} of {cards.length} · swipe right to view · left to pass
      </p>

      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => advance("left")}
          disabled={Boolean(exiting)}
          data-attr="resident-browse-swipe-pass"
          aria-label="Pass on this home"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-rose-400/80 bg-background text-2xl font-light text-rose-500 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          ×
        </button>
        <button
          type="button"
          onClick={() => advance("right")}
          disabled={Boolean(exiting)}
          data-attr="resident-browse-swipe-like"
          aria-label="View this home"
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-400/80 bg-background text-xl text-emerald-500 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          ♥
        </button>
      </div>
    </div>
  );
}
