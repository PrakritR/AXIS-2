import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="axis-page-frame relative flex min-h-screen flex-col">
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 18% -8%, rgba(10,132,255,0.09) 0%, transparent 55%), radial-gradient(ellipse 70% 45% at 96% 12%, rgba(77,163,255,0.07) 0%, transparent 50%)",
        }}
        aria-hidden
      />
      <PublicNavbar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-5 sm:py-16 md:py-20">
        <div className="w-full max-w-[460px]">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}
