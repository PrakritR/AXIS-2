import { AxisLogoMark } from "@/components/brand/axis-logo";

/** Shared OAuth / continue loading state — logo tile + steel-light spinner (no card). */
export function AuthOAuthLoading({
  label = "Loading your portal",
  caption,
}: {
  label?: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-10" role="status" aria-live="polite">
      <AxisLogoMark />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-steel-light/25 border-t-steel-light"
        aria-hidden
      />
      <span className="sr-only">{label}</span>
      {caption ? <p className="text-sm text-muted">{caption}</p> : null}
    </div>
  );
}
