import { AuthLayoutFooter, AuthLayoutHomeMark, AuthLayoutSubstrate } from "@/components/auth/auth-layout-chrome";
import { GeneralAssistantTrigger } from "@/components/general/general-assistant";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout axis-page-frame relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden" data-auth-layout>
      <AuthLayoutSubstrate />
      <AuthLayoutHomeMark />
      <div className="absolute right-0 top-0 z-30 p-4 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]">
        <GeneralAssistantTrigger />
      </div>
      <main className="auth-layout-main">
        <div className="auth-layout-panel w-full max-w-[min(100%,52rem)]">{children}</div>
      </main>
      <AuthLayoutFooter />
    </div>
  );
}
