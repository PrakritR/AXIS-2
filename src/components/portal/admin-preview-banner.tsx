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
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-[max(1rem,env(safe-area-inset-left,0px))] py-2.5 pe-[max(1rem,env(safe-area-inset-right,0px))] text-center text-sm text-amber-950 lg:px-8">
      <span className="font-semibold">Admin preview</span>
      {label ? <span>— viewing as {label}</span> : null}
      <button
        type="button"
        onClick={() => void exit()}
        className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
      >
        Exit preview
      </button>
      <span className="hidden text-amber-700/80 sm:inline">·</span>
      <Link href="/admin/dashboard" className="font-semibold text-amber-900 underline-offset-2 hover:underline">
        Back to admin
      </Link>
    </div>
  );
}
