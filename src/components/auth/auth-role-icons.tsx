import type { FC } from "react";

type IconProps = { className?: string };

/** Tenant / home — rounded door + roof */
export function AuthIconResident({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5 12 5l8 6.5V20a1.25 1.25 0 0 1-1.25 1.25H5.25A1.25 1.25 0 0 1 4 20v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M10 21.25V14a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v7.25"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <circle cx="12" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

/** Property portfolio — stacked building */
export function AuthIconManager({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 21V8.5l8-4.5 8 4.5V21"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
      <path d="M9.5 10h1M13.5 10h1M9.5 13h1M13.5 13h1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Sign in — user + arrow */
export function AuthIconSignIn({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.65" />
      <path
        d="M4 19.5c0-2.75 2.24-5 5-5s5 2.25 5 5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <path
        d="M16 12h5M19.5 8.5 23 12l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Application link — clipboard */
export function AuthIconApply({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M9 5V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V5"
        stroke="currentColor"
        strokeWidth="1.65"
      />
      <path d="M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

/** New account — plus badge */
export function AuthIconSpark({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.65" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Admin / platform — shield */
export function AuthIconAdmin({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 5 6.5V12c0 4.1 3 7.9 7 8.5 4-.6 7-4.4 7-8.5V6.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M9.5 12.5 11 14l3.5-4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type AuthRoleIconName = "resident" | "manager" | "admin" | "sign-in" | "apply" | "spark";

const ICONS: Record<AuthRoleIconName, FC<IconProps>> = {
  resident: AuthIconResident,
  manager: AuthIconManager,
  admin: AuthIconAdmin,
  "sign-in": AuthIconSignIn,
  apply: AuthIconApply,
  spark: AuthIconSpark,
};

export function AuthRoleIcon({ name, className }: { name: AuthRoleIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
