import { ImageIcon, ImageOff } from "lucide-react";

/**
 * Neutral "no photo" tile for production listings/rooms with zero genuine
 * uploaded photos. Never substitute stock/fabricated imagery for a real
 * listing — a prospective tenant would be misled into thinking it's a photo
 * of the actual unit. Absolutely positioned to fill a `relative` image slot,
 * same as the `next/image` `fill` it replaces.
 *
 * `variant="branded"` is the calmer, first-impression treatment for browse
 * cards: a soft branded wash and a plain image glyph that reads "no photo yet"
 * rather than the default's crossed-out "broken image" icon. It still clearly
 * communicates the absence of a photo — it does not fabricate one.
 */
export function NoImagePlaceholder({
  className = "",
  label,
  variant = "default",
}: {
  className?: string;
  label?: string;
  variant?: "default" | "branded";
}) {
  const branded = variant === "branded";
  const resolvedLabel = label ?? (branded ? "Photo coming soon" : "No image");
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${
        branded
          ? "bg-gradient-to-br from-accent/25 via-accent/15 to-primary/10 text-muted"
          : "bg-accent/40 text-muted"
      } ${className}`}
      role="img"
      aria-label={resolvedLabel}
    >
      {branded ? (
        <ImageIcon className="h-6 w-6 opacity-45" strokeWidth={1.5} aria-hidden />
      ) : (
        <ImageOff className="h-8 w-8" strokeWidth={1.5} aria-hidden />
      )}
      <span className={`text-xs font-medium ${branded ? "opacity-70" : ""}`}>{resolvedLabel}</span>
    </div>
  );
}
