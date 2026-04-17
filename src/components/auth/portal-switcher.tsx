"use client";

export type AuthRole = "resident" | "manager" | "admin";

const roles: { id: AuthRole; label: string; icon: string }[] = [
  { id: "resident", label: "Resident", icon: "⌂" },
  { id: "manager", label: "Manager", icon: "💼" },
  { id: "admin", label: "Admin", icon: "🔒" },
];

export function PortalSwitcher({
  value,
  onChange,
}: {
  value: AuthRole;
  onChange: (role: AuthRole) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {roles.map((r) => {
        const active = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className={`rounded-2xl border px-3 py-3 text-center transition ${
              active
                ? "border-primary bg-accent text-foreground"
                : "border-border bg-slate-50 text-muted hover:bg-white"
            }`}
          >
            <div className="text-lg">{r.icon}</div>
            <div className="mt-2 text-xs font-semibold">{r.label}</div>
          </button>
        );
      })}
    </div>
  );
}
