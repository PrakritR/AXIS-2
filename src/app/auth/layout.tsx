import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="axis-page-frame relative flex min-h-screen flex-col overflow-hidden">
      <ChromeSubstrate variant="full" />
      <PublicNavbar />
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-5 sm:py-16 md:py-20">
        <div className="w-full max-w-[460px]">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}
