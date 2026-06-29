import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { HideOnNative } from "@/components/native/hide-on-native";
import { PublicMainTransition } from "@/components/motion/public-main-transition";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="axis-page-frame relative flex min-h-screen flex-col">
      <HideOnNative>
        <ChromeSubstrate variant="quiet" />
        <PublicNavbar />
      </HideOnNative>
      <PublicMainTransition>
        <main className="flex-1">{children}</main>
      </PublicMainTransition>
      <HideOnNative>
        <PublicFooter />
      </HideOnNative>
    </div>
  );
}
