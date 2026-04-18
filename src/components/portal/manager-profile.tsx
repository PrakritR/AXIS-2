import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ManagerSectionShell } from "./manager-section-shell";

export async function ManagerProfile() {
  let fullName = "—";
  let email = "—";
  let phone = "—";
  let managerId = "—";

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      email = user.email ?? profile?.email ?? "—";
      fullName = profile?.full_name ?? "—";
      managerId = profile?.manager_id ?? "—";
    }
  } catch {
    /* Supabase not configured or no session */
  }

  return (
    <ManagerSectionShell title="Profile" actions={[{ label: "Edit", variant: "outline" }]}>
      <Card className="rounded-3xl border border-slate-200/80 p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Full name</label>
            <Input value={fullName} readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Email</label>
            <Input value={email} readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Phone</label>
            <Input value={phone} readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Manager ID</label>
            <Input value={managerId} readOnly className="font-mono text-sm" />
          </div>
        </div>
      </Card>
    </ManagerSectionShell>
  );
}
