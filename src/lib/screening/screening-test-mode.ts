/** Client-side Checkr sandbox toggle on the manager Screenings hub (not `/demo`). */

const STORAGE_KEY = "proplane_screening_test_mode_v1";

export function isScreeningTestModeActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setScreeningTestModeActive(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("proplane:screening-test-mode"));
  } catch {
    /* ignore quota / private mode */
  }
}

export function subscribeScreeningTestMode(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("proplane:screening-test-mode", listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("proplane:screening-test-mode", listener);
  };
}
