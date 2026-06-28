import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout axis-page-frame relative flex min-h-[100dvh] flex-col overflow-x-hidden" data-auth-layout>
      <ChromeSubstrate variant="full" />
      <main className="auth-layout-main relative flex flex-1 flex-col items-center justify-center px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:py-10 md:py-14">
        <div className="w-full max-w-[460px]">{children}</div>
      </main>
      <div className="auth-layout-footer">
        <PublicFooter />
      </div>
    </div>
  );
}
