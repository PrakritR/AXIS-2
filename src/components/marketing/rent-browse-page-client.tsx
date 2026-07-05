"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ResidentListingSearch } from "@/components/marketing/resident-listing-search";
import { useIsNativeApp } from "@/hooks/use-is-native-app";

function authCreateResidentPath() {
  return "/auth/create-account";
}

export function RentBrowsePageClient() {
  const searchParams = useSearchParams();
  const fromAuth = searchParams.get("from") === "auth";
  const { isNative } = useIsNativeApp();
  const backHref = fromAuth || isNative ? authCreateResidentPath() : "/";

  return (
    <div className="native-auth-screen min-h-[100dvh] px-4 py-6 [html[data-native]_&]:pt-[max(1.5rem,env(safe-area-inset-top))] [html[data-native]_&]:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-10">
      <div className="mx-auto w-full max-w-3xl text-center">
        {isNative === true && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-90"
          >
            ← Back
          </Link>
        )}

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Find your next home
        </h1>

        <div className="mt-8 text-left">
          <ResidentListingSearch />
        </div>
      </div>
    </div>
  );
}
