import { demoCursorClick } from "@/components/demo/demo-cursor-playback";
import { DEMO_LEASE_SIGN_PREPARE_EVENT, sleep } from "@/lib/demo/demo-playback";

export { sleep };

export function waitForSelector(
  root: HTMLElement,
  selector: string,
  timeoutMs = 12000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = root.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = root.querySelector(selector);
      if (el) {
        window.clearInterval(timer);
        resolve(el);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 120);
  });
}

export function waitForEvent(eventName: string, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: number | undefined;
    const onEvent = () => {
      window.removeEventListener(eventName, onEvent);
      if (timer) window.clearTimeout(timer);
      resolve(true);
    };
    timer = window.setTimeout(() => {
      window.removeEventListener(eventName, onEvent);
      resolve(false);
    }, timeoutMs);
    window.addEventListener(eventName, onEvent);
  });
}

/** Click a demo sidebar nav item — cursor travels to the exact button. */
export async function demoNavClick(frame: HTMLElement, section: string): Promise<boolean> {
  const selector = `[data-attr="demo-nav-${section}"]`;
  if (!(await waitForSelector(frame, selector, 8000))) return false;
  await demoCursorClick(selector);
  await sleep(520);
  return true;
}

export async function expandPortalRow(frame: HTMLElement, selector: string): Promise<void> {
  if (!(await waitForSelector(frame, selector, 10000))) return;
  await demoCursorClick(selector);
  await sleep(480);
}

export async function expandCollapsible(frame: HTMLElement, toggleSelector: string): Promise<void> {
  const toggle = await waitForSelector(frame, toggleSelector, 6000);
  if (!toggle) return;
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  if (!expanded) {
    await demoCursorClick(toggleSelector);
    await sleep(420);
  }
}

export async function confirmNotificationModal(frame: HTMLElement): Promise<void> {
  const skip = frame.querySelector('[data-attr="portal-notification-skip-message"]');
  if (skip instanceof HTMLInputElement && !skip.checked) {
    await demoCursorClick('[data-attr="portal-notification-skip-message"]');
    await sleep(220);
  }
  await demoCursorClick('[data-attr="portal-notification-confirm"]', { align: "end" });
  await sleep(520);
}

export async function prepareAndConfirmLeaseSign(frame: HTMLElement, name: string): Promise<void> {
  window.dispatchEvent(new CustomEvent(DEMO_LEASE_SIGN_PREPARE_EVENT, { detail: { name } }));
  await sleep(320);
  if (await waitForSelector(frame, '[data-attr="lease-sign-agree"]', 4000)) {
    await demoCursorClick('[data-attr="lease-sign-agree"]');
    await sleep(240);
  }
  await demoCursorClick('[data-attr="lease-sign-confirm"]', { align: "end" });
  await sleep(780);
}

export async function clickIfPresent(
  frame: HTMLElement,
  selector: string,
  options?: { align?: "center" | "end"; timeoutMs?: number },
): Promise<boolean> {
  if (!(await waitForSelector(frame, selector, options?.timeoutMs ?? 5000))) return false;
  await demoCursorClick(selector, { align: options?.align });
  await sleep(options?.align === "end" ? 520 : 420);
  return true;
}
