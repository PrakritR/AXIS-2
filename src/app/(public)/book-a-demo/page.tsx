"use client";

import { BOOK_DEMO_HREF } from "@/lib/marketing/public-contact";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Legacy path — demo booking lives on Contact → Book a demo tab. */
export default function BookADemoRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(BOOK_DEMO_HREF);
  }, [router]);

  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      <p className="text-center text-sm text-muted">Redirecting to book a demo…</p>
    </div>
  );
}
