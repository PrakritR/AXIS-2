import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout axis-page-frame relative flex min-h-[100dvh] flex-col overflow-x-hidden" data-auth-layout>
      <ChromeSubstrate variant="full" />
      <main className="auth-layout-main">
        <div className="auth-layout-panel w-full max-w-[460px]">{children}</div>
      </main>
      <div className="auth-layout-footer">
        <PublicFooter />
      </div>
    </div>
  );
}
