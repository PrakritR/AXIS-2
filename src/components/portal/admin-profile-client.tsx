"use client";

import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";

function ProfileField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div
        className={`rounded-xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 text-[15px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${
          mono ? "break-all font-mono text-sm leading-relaxed" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function AdminProfileClient({
  fullName,
  email,
  phone,
  adminId,
}: {
  fullName: string;
  email: string;
  phone: string;
  adminId: string;
}) {
  const { showToast } = useAppUi();

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 self-start rounded-full border-slate-200/90 px-5 py-2.5 text-sm font-semibold text-slate-900 sm:self-auto"
          onClick={() => showToast("Profile editing will connect to your account settings soon.")}
        >
          Edit info
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
        <ProfileField label="Full name" value={fullName} />
        <ProfileField label="Email" value={email} />
        <ProfileField label="Phone" value={phone} />
        <ProfileField label="Admin ID" value={adminId} mono />
      </div>
    </div>
  );
}
