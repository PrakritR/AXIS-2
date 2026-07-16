"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ResidentHousingBrowse } from "@/components/marketing/resident-housing-browse";
import { PublicPageAuthFooter } from "@/components/marketing/public-page-auth-footer";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { portalNavClick } from "@/lib/portal-nav-client";
import { residentCreateAccountHref, residentSignInHref } from "@/lib/resident-public-nav";

function authCreateResidentPath() {
  return "/auth/create-account?mode=create&role=resident";
}

export function RentBrowsePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromAuth = searchParams.get("from") === "auth";
  const fromApplication = searchParams.get("from") === "application";
<<<<<<< HEAD
  const applicationReturn = searchParams.get("return")?.trim() ?? "";
  const { isNative } = useIsNativeApp();
  const backHref =
    fromApplication && applicationReturn.startsWith("/")
      ? applicationReturn
      : fromAuth || isNative
        ? authCreateResidentPath()
        : "/";
=======
  const returnParam = searchParams.get("return")?.trim() ?? "";
  const applicationBackHref = returnParam.startsWith("/")
    ? returnParam
    : "/resident/applications/apply";
  const { isNative } = useIsNativeApp();
  const backHref = fromApplication
    ? applicationBackHref
    : fromAuth || isNative
      ? authCreateResidentPath()
      : "/";
  const showBrowseBack = fromApplication || isNative === true;
  const backLabel = fromApplication ? "← Back to application" : "← Back";
>>>>>>> fm/captain-wip-ship-s1
  const onBackClick = useMemo(
    () =>
      showBrowseBack
        ? portalNavClick(router, backHref, { preferFullNavigation: true })
        : undefined,
    [backHref, showBrowseBack, router],
  );

  return (
    <div className="native-auth-screen min-h-[100dvh] px-4 py-5 [html[data-native]_&]:pt-[max(1rem,env(safe-area-inset-top))] [html[data-native]_&]:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-8">
      <div className="mx-auto w-full max-w-7xl">
<<<<<<< HEAD
        {(isNative === true || fromApplication) && (
=======
        {showBrowseBack ? (
>>>>>>> fm/captain-wip-ship-s1
          <Link
            href={backHref}
            onClick={onBackClick}
            data-attr={fromApplication ? "resident-browse-back-application" : "resident-browse-back"}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-90"
          >
<<<<<<< HEAD
            ← {fromApplication ? "Back to application" : "Back"}
=======
            {backLabel}
>>>>>>> fm/captain-wip-ship-s1
          </Link>
        ) : null}

        <header className={`text-center ${showBrowseBack ? "mt-4" : "mt-2"}`}>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Browse homes
          </h1>
        </header>

        <div className="mt-6 sm:mt-8">
          <ResidentHousingBrowse />
        </div>

        {isNative !== true ? (
          <PublicPageAuthFooter
            getStartedHref={residentCreateAccountHref()}
            signInHref={residentSignInHref()}
            getStartedDataAttr="resident-browse-get-started"
            signInDataAttr="resident-browse-sign-in"
          />
        ) : null}
      </div>
    </div>
  );
}
