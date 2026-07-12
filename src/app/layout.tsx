import { AppUiProvider } from "@/components/providers/app-ui-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthOAuthErrorHandler } from "@/components/auth/auth-oauth-error-handler";
import { GeneralAssistant } from "@/components/general/general-assistant";
import { NativeAppGate } from "@/components/native/native-app-gate";
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
    default: "PropLane",
    template: "%s · PropLane",
  },
  description:
    "PropLane — AI-powered property management for applications, screening, leases, and rent collection.",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=window.Capacitor;if(c&&c.isNativePlatform&&c.isNativePlatform()){var p=c.getPlatform&&c.getPlatform();document.documentElement.setAttribute('data-native',p==='android'?'android':'ios');var vp=document.querySelector('meta[name="viewport"]');if(vp)vp.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');var hide=function(){try{var m=c.Plugins&&c.Plugins.SplashScreen;if(m&&m.hide)m.hide();}catch(e){}};hide();window.addEventListener('load',hide);setTimeout(hide,2500);var u=new URL(location.href);if((u.pathname==='/'||u.pathname==='')&&(u.searchParams.get('code')||u.searchParams.get('error'))){u.pathname='/auth/callback';location.replace(u.pathname+u.search+u.hash);}}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full overflow-x-clip bg-background text-foreground">
        <ThemeProvider defaultTheme="dark">
          <AppUiProvider>
            <AuthOAuthErrorHandler />
            <NativeBridge />
            <NativeAppGate>{children}</NativeAppGate>
            {/* Site-wide general AI assistant — pinned bottom-right on every page
                (public, auth, portal). Distinct from the portal-scoped Axis
                Assistant; it lifts above that FAB when both are on screen. */}
            <GeneralAssistant />
          </AppUiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
