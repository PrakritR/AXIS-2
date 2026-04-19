"use client";

import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";

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
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Profile</h1>
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
