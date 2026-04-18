import { LoadingCards } from "@/components/ui/empty-state";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="h-10 w-64 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-6 h-5 w-96 max-w-full animate-pulse rounded-full bg-slate-200" />
      <div className="mt-10">
        <LoadingCards />
      </div>
    </div>
  );
}
