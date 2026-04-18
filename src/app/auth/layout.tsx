import { ChatFab } from "@/components/layout/chat-fab";
import { PublicAnnouncement } from "@/components/layout/public-announcement";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-white via-[#fafcff] to-[#f1f5f9]">
      <PublicAnnouncement />
      <PublicNavbar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
      <PublicFooter />
      <ChatFab />
    </div>
  );
}
