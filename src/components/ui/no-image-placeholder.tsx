import { ImageOff } from "lucide-react";

/**
 * Neutral "no photo" tile for production listings/rooms with zero genuine
 * uploaded photos. Never substitute stock/fabricated imagery for a real
 * listing — a prospective tenant would be misled into thinking it's a photo
 * of the actual unit. Absolutely positioned to fill a `relative` image slot,
 * same as the `next/image` `fill` it replaces.
 */
export function NoImagePlaceholder({
  className = "",
  label = "No image",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-accent/40 text-muted ${className}`}
      role="img"
      aria-label={label}
    >
      <ImageOff className="h-8 w-8" strokeWidth={1.5} aria-hidden />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
