import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import CreateAccountClient from "./create-account-client";

/** Avoid static prerender issues with search params / client hooks in production. */
export const dynamic = "force-dynamic";

function CreateAccountFallback() {
  return (
    <AuthCard>
      <p className="text-center text-sm text-slate-600">Loading…</p>
    </AuthCard>
  );
}

export default function CreateAccountPage() {
  return (
    <Suspense fallback={<CreateAccountFallback />}>
      <CreateAccountClient />
    </Suspense>
  );
}
