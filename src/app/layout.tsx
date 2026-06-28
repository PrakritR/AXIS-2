import { AppUiProvider } from "@/components/providers/app-ui-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthOAuthErrorHandler } from "@/components/auth/auth-oauth-error-handler";
import { NativeBridge } from "@/components/native/native-bridge";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#080b14",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Axis",
    template: "%s · Axis",
  },
  description:
    "Axis — AI-powered property management for applications, screening, leases, and rent collection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('axis:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t||'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body className="min-h-full overflow-x-clip bg-background text-foreground">
        <ThemeProvider defaultTheme="dark">
          <AppUiProvider>
            <AuthOAuthErrorHandler />
            <NativeBridge />
            {children}
          </AppUiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
