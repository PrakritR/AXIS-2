"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function AdminPreviewBanner({ label }: { label: string | null }) {
  const router = useRouter();

  const exit = async () => {
    await fetch("/api/admin/preview", { method: "DELETE" });
    router.push("/admin/dashboard");
    router.refresh();
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/25 bg-primary/10 px-[max(1rem,env(safe-area-inset-left,0px))] py-2.5 pe-[max(1rem,env(safe-area-inset-right,0px))] text-center text-sm text-foreground backdrop-blur-xl lg:px-8">
      <span className="font-semibold">Admin preview</span>
      {label ? <span className="text-muted">— viewing as {label}</span> : null}
      <button
        type="button"
        onClick={() => void exit()}
        className="font-semibold text-primary underline underline-offset-2 hover:text-cobalt-deep"
      >
        Exit preview
      </button>
      <span className="hidden text-muted sm:inline">·</span>
      <Link href="/admin/dashboard" className="font-semibold text-primary underline-offset-2 hover:underline">
        Back to admin
      </Link>
    </div>
  );
}
