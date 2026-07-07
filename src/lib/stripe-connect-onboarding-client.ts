import { isDemoModeActive } from "@/lib/demo/demo-session";
import { openAppUrl, shouldUseInAppConnectFlow } from "@/lib/native/open-url";

type OnboardResponse = {
  url?: string;
  demo?: boolean;
  message?: string;
  error?: string;
};

/**
 * Opens Stripe Connect Express onboarding in a new browser tab (or in-app WebView
 * on native). Must be called from a direct user gesture so popup blockers allow the tab.
 */
export async function openStripeConnectOnboarding(opts: {
  apiBase?: string;
  showToast: (message: string) => void;
}): Promise<boolean> {
  const apiBase = opts.apiBase ?? "/api/stripe/connect";

  if (isDemoModeActive()) {
    opts.showToast("Demo mode — payouts are already linked to a sandbox account.");
    return false;
  }

  const useInAppFlow = shouldUseInAppConnectFlow();
  let popup: Window | null = null;

  if (!useInAppFlow) {
    popup = window.open("about:blank", "_blank");
    if (!popup) {
      const message = "Could not open a new tab. Allow pop-ups for this site and try again.";
      opts.showToast(message);
      return false;
    }

    try {
      popup.document.title = "Opening Stripe…";
      popup.document.body.innerHTML =
        '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#444">Opening secure bank setup…</p>';
    } catch {
      /* cross-origin once navigated */
    }
  }

  try {
    const res = await fetch(`${apiBase}/onboard`, {
      method: "POST",
      credentials: "include",
    });
    const body = (await res.json()) as OnboardResponse;
    if (!res.ok) {
      const message = body.error ?? "Could not start bank linking.";
      popup?.close();
      opts.showToast(message);
      return false;
    }
    if (body.demo && body.message) {
      popup?.close();
      opts.showToast(body.message);
      return false;
    }
    if (body.url) {
      if (useInAppFlow) {
        void openAppUrl(body.url);
        return true;
      }
      popup!.location.href = body.url;
      return true;
    }
    popup?.close();
    opts.showToast("Stripe did not return an onboarding URL.");
    return false;
  } catch {
    popup?.close();
    opts.showToast("Could not start bank linking.");
    return false;
  }
}
