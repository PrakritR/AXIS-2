import { AuthLayoutFooter, AuthLayoutSubstrate } from "@/components/auth/auth-layout-chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout axis-page-frame relative flex min-h-[100dvh] flex-col overflow-x-hidden" data-auth-layout>
      <AuthLayoutSubstrate />
      <main className="auth-layout-main">
        <div className="auth-layout-panel w-full max-w-[460px]">{children}</div>
      </main>
      <AuthLayoutFooter />
    </div>
  );
}
