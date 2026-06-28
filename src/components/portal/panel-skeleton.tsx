import { LoadingCards } from "@/components/ui/empty-state";

/** Placeholder while a code-split portal panel loads. */
export function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-9 w-48 rounded-full bg-accent/50" />
      <div className="h-4 w-72 max-w-full rounded-full bg-accent/40" />
      <LoadingCards />
    </div>
  );
}
