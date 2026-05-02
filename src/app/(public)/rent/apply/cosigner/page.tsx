"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CosignerApplyFlow } from "../cosigner-flow";

export default function CosignerApplyPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/rent/apply" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
        ← Back to main application
      </Link>
      <CosignerApplyFlow onBack={() => router.push("/rent/apply")} onDone={() => router.push("/rent/apply")} />
    </div>
  );
}
