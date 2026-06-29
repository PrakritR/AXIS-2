import type { ReactNode } from "react";
import Link from "next/link";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { AuthRoleIcon, type AuthRoleIconName } from "@/components/auth/auth-role-icons";
import { detectNativePlatformSync } from "@/lib/native/detect-native";

type AuthPageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: boolean;
  showLogo?: boolean;
};

/** Welcome / entry — logo mark + title (fills vertical space on phone). */
export function AuthBrandHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="auth-brand-header flex flex-col items-center text-center">
      <AxisLogoMark
        size="default"
        className="auth-brand-logo shadow-[0_14px_44px_-14px_rgba(47,107,255,0.5)]"
      />
      <h1 className="auth-brand-title mt-4 text-[1.5rem] font-semibold tracking-tight text-gradient-accent sm:mt-5 sm:text-[1.625rem]">
        {title}
      </h1>
      {subtitle ? (
        <p className="auth-brand-subtitle mt-1.5 max-w-[17rem] text-[13px] leading-snug text-muted sm:text-sm">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function AuthPageHeader({
  eyebrow = "Axis",
  title,
  subtitle,
  accent = true,
  showLogo = false,
}: AuthPageHeaderProps) {
  return (
    <header className="auth-page-header text-center">
      {showLogo ? (
        <AxisLogoMark size="compact" className="auth-page-logo mx-auto mb-3 sm:mb-3.5" />
      ) : (
        <p className="auth-page-eyebrow text-[10px] font-bold uppercase tracking-[0.22em] text-primary/75 sm:text-[11px]">
          {eyebrow}
        </p>
      )}
      <h1
        className={`${showLogo ? "mt-0" : "mt-2"} text-[1.35rem] font-semibold tracking-tight sm:text-[1.5rem] ${
          accent ? "text-gradient-accent" : "text-foreground"
        }`}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="auth-page-subtitle mx-auto mt-1.5 max-w-[16rem] text-[13px] leading-snug text-muted sm:mt-2 sm:max-w-none sm:text-sm">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

export function AuthChoiceList({ children }: { children: ReactNode }) {
  return <div className="auth-choice-list mt-5 space-y-2.5 sm:mt-6 sm:space-y-3">{children}</div>;
}

type AuthRoleTabOption = {
  id: string;
  label: string;
  hint?: string;
  icon: AuthRoleIconName;
  tone?: "blue" | "steel";
};

export function AuthRoleTabs({
  options,
  onSelect,
  disabled = false,
  busyId = null,
}: {
  options: AuthRoleTabOption[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  busyId?: string | null;
}) {
  return (
    <div className="auth-role-tabs mt-5 flex flex-wrap justify-center gap-3 sm:mt-6">
      {options.map((option) => {
        const iconWrap =
          option.tone === "steel"
            ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.4),rgba(188,212,255,0.3))] text-[#1a2f5c]"
            : "bg-[linear-gradient(135deg,var(--primary),var(--sky))] text-white shadow-[0_8px_20px_-10px_rgba(47,107,255,0.55)]";
        const isBusy = busyId === option.id;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            disabled={disabled || isBusy}
            className="auth-role-tab group flex min-w-[7.5rem] max-w-[11rem] flex-1 flex-col items-center rounded-[1.125rem] border border-border/70 bg-card/50 px-4 py-4 text-center transition-all duration-200 hover:border-primary/35 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[8.5rem] sm:max-w-[12rem] sm:px-5 sm:py-5"
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${iconWrap}`}
              aria-hidden
            >
              <AuthRoleIcon name={option.icon} className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
            </span>
            <span className="mt-3 text-[15px] font-semibold text-foreground sm:text-base">
              {isBusy ? "Opening…" : option.label}
            </span>
            {option.hint ? (
              <span className="auth-role-tab-hint mt-1 text-[11px] leading-snug text-muted sm:text-xs">{option.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Full-width vertical role picker — preferred on phone and native app. */
export function AuthRoleStack({
  options,
  onSelect,
  disabled = false,
  busyId = null,
}: {
  options: AuthRoleTabOption[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  busyId?: string | null;
}) {
  return (
    <div className="auth-role-stack mt-4 flex w-full flex-col gap-2.5 sm:mt-5 sm:gap-3">
      {options.map((option) => (
        <AuthRoleCard
          key={option.id}
          label={option.label}
          hint={option.hint}
          icon={option.icon}
          tone={option.tone}
          busy={busyId === option.id}
          disabled={disabled}
          onClick={() => onSelect(option.id)}
        />
      ))}
    </div>
  );
}

type AuthRoleCardProps = {
  label: string;
  hint?: string;
  icon: AuthRoleIconName;
  tone?: "blue" | "steel";
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
};

export function AuthRoleCard({
  label,
  hint,
  icon,
  tone = "blue",
  onClick,
  disabled = false,
  busy = false,
}: AuthRoleCardProps) {
  const iconWrap =
    tone === "steel"
      ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.35),rgba(188,212,255,0.25))] text-[#1a2f5c]"
      : "bg-[linear-gradient(135deg,var(--primary),var(--sky))] text-white shadow-[0_8px_20px_-10px_rgba(47,107,255,0.65)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="auth-choice-button group w-full rounded-[18px] text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
    >
      <div className="rounded-[18px] bg-[linear-gradient(135deg,rgba(47,107,255,0.55),rgba(143,180,255,0.35))] p-[1.5px] shadow-[0_10px_28px_-14px_rgba(47,107,255,0.45)] transition group-hover:shadow-[0_14px_36px_-12px_rgba(47,107,255,0.5)] group-active:scale-[0.995]">
        <div className="flex items-center gap-3 rounded-[16.5px] bg-[var(--glass-fill)] px-3.5 py-3 backdrop-blur-xl sm:gap-3.5 sm:px-4 sm:py-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${iconWrap}`}
            aria-hidden
          >
            <AuthRoleIcon name={icon} className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[15px] text-foreground sm:text-base">{busy ? "Opening…" : label}</p>
            {hint ? (
              <p className="auth-choice-hint mt-0.5 text-[12px] leading-snug text-muted sm:text-[13px]">{hint}</p>
            ) : null}
          </div>
          <span
            className="text-primary/40 transition group-hover:translate-x-0.5 group-hover:text-primary/70"
            aria-hidden
          >
            →
          </span>
        </div>
      </div>
    </button>
  );
}

/** @deprecated Use AuthRoleCard */
export function AuthChoiceButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
}) {
  return <AuthRoleCard label={label} hint={hint} icon="sign-in" onClick={onClick} />;
}

export function AuthBackLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="auth-back-link mt-5 block w-full text-center text-[13px] font-semibold text-primary/90 transition hover:text-primary sm:mt-6 sm:text-sm"
      >
        {children}
      </button>
    );
  }
  return null;
}

export function AuthFooterLink({ href, children }: { href: string; children: ReactNode }) {
  if (detectNativePlatformSync()) return null;
  return (
    <p className="auth-footer-link mt-5 text-center text-[13px] text-muted sm:mt-6 sm:text-sm">
      <Link href={href} className="font-semibold text-primary hover:opacity-90">
        {children}
      </Link>
    </p>
  );
}

export function AuthLoadingCard({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <span className="auth-loading-ring h-9 w-9 rounded-full border-2 border-primary/20 border-t-primary" aria-hidden />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="auth-divider flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden />
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden />
    </div>
  );
}

export function AuthFieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="auth-field-block rounded-2xl border border-border/70 bg-card/40 p-3.5 backdrop-blur-sm sm:p-4">
      <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
