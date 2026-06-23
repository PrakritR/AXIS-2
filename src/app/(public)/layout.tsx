import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicMainTransition } from "@/components/motion/public-main-transition";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="axis-page-frame relative flex min-h-screen flex-col">
      <ChromeSubstrate variant="quiet" />
      <PublicNavbar />
      <PublicMainTransition>
        <main className="flex-1">{children}</main>
      </PublicMainTransition>
      <PublicFooter />
    </div>
  );
}
