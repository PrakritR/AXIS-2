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
    <div
      className="flex min-h-screen flex-col"
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #f5f9ff 40%, #eef4ff 100%)",
      }}
    >
      <PublicAnnouncement />
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <ChatFab />
    </div>
  );
}
