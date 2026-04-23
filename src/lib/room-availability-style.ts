/**
 * Classify manager / listing room availability copy for traffic-light UI:
 * green = available now (or on/after the "available after" date), red = not available, yellow = future-dated opening.
 */

export type RoomAvailabilityTone = "available" | "unavailable" | "future" | "neutral";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfLocalToday(): Date {
  return startOfLocalDay(new Date());
}

function parseAfterDateFragment(fragment: string): Date | null {
  const t = fragment.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return startOfLocalDay(d);
}

/**
 * Map listing copy to a display tone. Unavailable / not open = red; open now = green;
 * "available after" still in the future = yellow; past that date = green.
 */
export function roomAvailabilityTone(text: string): RoomAvailabilityTone {
  const raw = text.trim();
  const t = raw.toLowerCase();

  if (/\bunavailable\b|not available|signed.*not available|no longer available|not open\b/.test(t)) {
    return "unavailable";
  }

  const after = raw.match(/available\s+after\s+(.+)/i);
  if (after) {
    const d = parseAfterDateFragment(after[1]!);
    if (d) {
      return startOfLocalToday().getTime() >= d.getTime() ? "available" : "future";
    }
    return "future";
  }

  if (/\bwaitlist\b|\bavailable soon\b/i.test(raw)) return "future";

  if (/\bavailable now\b/i.test(raw)) return "available";

  if (/^available\s*$/i.test(raw)) return "available";

  if (t.includes("available") && !t.includes("after") && !t.includes("un")) return "available";

  return "neutral";
}

export function roomAvailabilityPillClasses(tone: RoomAvailabilityTone): { wrap: string; dot: string } {
  switch (tone) {
    case "available":
      return {
        wrap: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
        dot: "bg-emerald-500",
      };
    case "unavailable":
      return {
        wrap: "bg-rose-50 text-rose-800 ring-rose-200/80",
        dot: "bg-rose-500",
      };
    case "future":
      return {
        wrap: "bg-amber-50 text-amber-900 ring-amber-200/80",
        dot: "bg-amber-500",
      };
    default:
      return {
        wrap: "bg-slate-100 text-slate-700 ring-slate-200/80",
        dot: "bg-slate-400",
      };
  }
}

/** Text color classes for plain availability lines (search cards). */
export function roomAvailabilityTextClasses(tone: RoomAvailabilityTone): string {
  switch (tone) {
    case "available":
      return "text-emerald-700";
    case "unavailable":
      return "text-rose-700";
    case "future":
      return "text-amber-800";
    default:
      return "text-slate-600";
  }
}
