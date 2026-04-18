import { AppUiProvider } from "@/components/providers/app-ui-provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Axis Housing",
    template: "%s · Axis Housing",
  },
  description:
    "Axis Housing — housing search, applications, and portals (UI shell).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <AppUiProvider>{children}</AppUiProvider>
      </body>
    </html>
  );
}
