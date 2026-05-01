import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicAtmosphere } from "@/components/motion/public-atmosphere";
import { PublicMainTransition } from "@/components/motion/public-main-transition";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="axis-page-frame relative flex min-h-screen flex-col">
      <PublicAtmosphere />
      <PublicNavbar />
      <PublicMainTransition>
        <main className="flex-1">{children}</main>
      </PublicMainTransition>
      <PublicFooter />
    </div>
  );
}
