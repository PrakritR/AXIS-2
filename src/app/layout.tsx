import { AppUiProvider } from "@/components/providers/app-ui-provider";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f3f5f9",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Axis",
    template: "%s · Axis",
  },
  description:
    "Axis — find rooms for rent, apply online, and manage your lease in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full overflow-x-clip bg-background text-foreground">
        <AppUiProvider>{children}</AppUiProvider>
      </body>
    </html>
  );
}
