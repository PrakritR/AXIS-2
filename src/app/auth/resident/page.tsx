"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MobileEmailSignIn } from "@/components/auth/mobile-email-sign-in";
import {
  AuthBackLink,
  AuthDivider,
  AuthFieldBlock,
  AuthPageHeader,
  AuthRoleTabs,
} from "@/components/auth/auth-mobile-primitives";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseManagerApplicationLink } from "@/lib/auth/parse-resident-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ResidentMode = "choose" | "sign-in" | "apply";

export default function ResidentAuthPage() {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [mode, setMode] = useState<ResidentMode>("choose");
  const [applicationLink, setApplicationLink] = useState("");

  const continueWithLink = () => {
    const parsed = parseManagerApplicationLink(applicationLink);
    if (parsed.kind === "invalid") {
      showToast(parsed.reason);
      return;
    }
    router.push(parsed.href);
  };

  if (mode === "choose") {
    return (
      <AuthCard>
        <AuthPageHeader eyebrow="Resident" title="Get started" subtitle="Sign in or apply with your manager's link" />

        <AuthRoleTabs
          options={[
            { id: "sign-in", label: "Sign in", hint: "Google or email", icon: "sign-in" },
            { id: "apply", label: "Apply", hint: "Paste link", icon: "apply", tone: "steel" },
          ]}
          onSelect={(id) => setMode(id as ResidentMode)}
        />

        <p className="auth-footer-link mt-5 text-center text-[13px] text-muted sm:mt-6 sm:text-sm">
          <Link className="font-semibold text-primary hover:opacity-90" href="/auth/welcome">
            Change role
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (mode === "sign-in") {
    return (
      <AuthCard>
        <AuthPageHeader eyebrow="Resident" title="Sign in" accent={false} />

        <div className="mt-5">
          <GoogleSignInButton nextPath="/resident/dashboard" />
        </div>

        <div className="my-4">
          <AuthDivider />
        </div>

        <MobileEmailSignIn nextPath="/resident/dashboard" />

        <AuthBackLink onClick={() => setMode("choose")}>← Back</AuthBackLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthPageHeader eyebrow="Resident" title="Apply" subtitle="Paste the link from your manager" accent={false} />

      <div className="mt-5 sm:mt-6">
        <AuthFieldBlock label="Application link">
          <Input
            id="application-link"
            className="border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
            placeholder="https://…/rent/apply?…"
            value={applicationLink}
            onChange={(e) => setApplicationLink(e.target.value)}
            autoComplete="off"
            inputMode="url"
          />
        </AuthFieldBlock>
      </div>

      <Button
        type="button"
        className="btn-cobalt mt-4 w-full rounded-full py-2.5 text-[15px] font-semibold sm:mt-5 sm:py-3 sm:text-base"
        onClick={continueWithLink}
        disabled={!applicationLink.trim()}
      >
        Continue
      </Button>

      <AuthBackLink onClick={() => setMode("choose")}>← Back</AuthBackLink>
    </AuthCard>
  );
}
