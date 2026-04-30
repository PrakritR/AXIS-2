import { AuthCard } from "@/components/auth/auth-card";
import Link from "next/link";

export default async function CreateOwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot } = await searchParams;
  const slotQuery = slot ? `&slot=${encodeURIComponent(slot)}` : "";

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Owner invite</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
        Owner accounts are created only from a link your property manager sent you. Use the same email they expect for
        this property group.
        {slot ? (
          <>
            {" "}
            This link is tied to <span className="font-semibold text-[#0f172a]">owner slot {slot}</span>.
          </>
        ) : null}
      </p>

      <div className="mt-8 space-y-3">
        <Link
          href={`/auth/create-account?role=owner${slotQuery}`}
          className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground transition hover:opacity-95"
        >
          Continue to create account
        </Link>
        <Link
          href="/auth/sign-in"
          className="flex w-full items-center justify-center rounded-full border border-[#e0e4ec] py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Already have an account? Sign in
        </Link>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        After signup you use <span className="font-semibold text-slate-700">property portal login</span> for the houses your property team linked.
      </p>
    </AuthCard>
  );
}
