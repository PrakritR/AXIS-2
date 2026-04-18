"use client";

export type AuthRole = "resident" | "manager" | "admin";

const roles: { id: AuthRole; label: string }[] = [
  { id: "resident", label: "Resident" },
  { id: "manager", label: "Manager" },
  { id: "admin", label: "Admin" },
];

export function PortalSwitcher({
  value,
  onChange,
}: {
  value: AuthRole;
  onChange: (role: AuthRole) => void;
}) {
  return (
    <div className="flex rounded-full bg-slate-100/95 p-1.5 shadow-inner ring-1 ring-slate-200/80">
      {roles.map((r) => {
        const active = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-2.5 text-center transition ${
              active
                ? "border-2 border-[#2b5ce7] bg-white text-slate-900 shadow-sm"
                : "border-2 border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700"
            }`}
          >
            <RoleIcon role={r.id} active={active} />
            <span className={`text-[11px] font-semibold ${active ? "text-slate-900" : ""}`}>{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RoleIcon({ role, active }: { role: AuthRole; active: boolean }) {
  const c = active ? "#2b5ce7" : "#94a3b8";
  if (role === "resident") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
          stroke={c}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (role === "manager") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-2"
          stroke={c}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 12h4" stroke={c} strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke={c} strokeWidth="1.75" />
      <path
        d="M9 11V7a3 3 0 016 0v4"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
