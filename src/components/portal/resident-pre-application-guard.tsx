"use client";

import { isResidentPreApplicationAllowedPath } from "@/lib/resident-portal-route-guard";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function ResidentPreApplicationGuard({
  isPreApplicationResident,
  children,
}: {
  isPreApplicationResident: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isPreApplicationResident) return;
    if (isResidentPreApplicationAllowedPath(pathname)) return;
    router.replace("/resident/applications");
  }, [isPreApplicationResident, pathname, router]);

  return children;
}
