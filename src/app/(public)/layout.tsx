import { ChatFab } from "@/components/layout/chat-fab";
import { PublicAnnouncement } from "@/components/layout/public-announcement";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNavbar } from "@/components/layout/public-navbar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-white via-[#fafcff] to-[#f1f5f9]">
      <PublicAnnouncement />
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <ChatFab />
    </div>
  );
}
