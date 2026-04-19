import { AppUiProvider } from "@/components/providers/app-ui-provider";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: {
    default: "Axis",
    template: "%s · Axis",
  },
  description:
    "Axis — find rooms for rent, apply online, and manage your lease in one place (demo UI).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full overflow-x-clip bg-background text-foreground">
        <AppUiProvider>{children}</AppUiProvider>
      </body>
    </html>
  );
}
