"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ResidentHousingBrowse } from "@/components/marketing/resident-housing-browse";
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
    <div className="native-auth-screen min-h-[100dvh] px-4 py-5 [html[data-native]_&]:pt-[max(1rem,env(safe-area-inset-top))] [html[data-native]_&]:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-8">
      <div className="mx-auto w-full max-w-7xl">
        {isNative === true && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-90"
          >
            ← Back
          </Link>
        )}

        <header className={`text-center ${isNative === true ? "mt-4" : "mt-2"}`}>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Browse homes
          </h1>
        </header>

        <div className="mt-6 sm:mt-8">
          <ResidentHousingBrowse />
        </div>
      </div>
    </div>
  );
}
