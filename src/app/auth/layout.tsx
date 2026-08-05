import { AuthLayoutFooter, AuthLayoutHomeMark, AuthLayoutSubstrate } from "@/components/auth/auth-layout-chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout axis-page-frame relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden" data-auth-layout>
      <AuthLayoutSubstrate />
      <AuthLayoutHomeMark />
      <main className="auth-layout-main">
        <div className="auth-layout-panel w-full max-w-[min(100%,52rem)]">{children}</div>
      </main>
      <AuthLayoutFooter />
    </div>
  );
}
