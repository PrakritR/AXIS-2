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
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950 lg:px-8">
      <span className="font-semibold">Admin preview</span>
      {label ? <span className="mx-1">— viewing as {label}</span> : null}
      <button
        type="button"
        onClick={() => void exit()}
        className="ml-2 font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
      >
        Exit preview
      </button>
      <span className="mx-2 text-amber-700/80">·</span>
      <Link href="/admin/dashboard" className="font-semibold text-amber-900 hover:underline">
        Back to admin
      </Link>
    </div>
  );
}
