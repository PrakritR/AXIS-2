import { LoadingCards } from "@/components/ui/empty-state";

/** Instant feedback while a portal section page streams in. */
export function PortalSectionLoading() {
  return (
    <div className="animate-pulse space-y-6 px-1 py-2" aria-busy="true" aria-live="polite">
      <div className="h-9 w-48 rounded-full bg-accent/50" />
      <div className="h-4 w-80 max-w-full rounded-full bg-accent/40" />
      <LoadingCards />
    </div>
  );
}
