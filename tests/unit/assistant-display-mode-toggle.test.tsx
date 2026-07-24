// @vitest-environment jsdom
//
// The assistant's presentation preference, driven through the real components a
// manager touches: the floating popup's "pin", the dock's "unpin", and the
// Settings radio group. All three write the SAME persisted preference, and the
// default — nothing stored — must be the popup with NO right rail, so the portal
// content keeps the full width.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/use-manager-user-id", () => ({
  useManagerUserId: () => ({ userId: "mgr-1", email: "mgr@example.com", ready: true }),
}));

import { AssistantDisplayModeSetting } from "@/components/portal/assistant-display-mode-setting";
import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalAssistantDockRail } from "@/components/portal/portal-assistant-dock-rail";
import { readAssistantDisplayMode } from "@/lib/assistant-display-preferences";

const USER = "mgr-1";

function installFakeStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

/** The manager portal shell: assistant chrome + the opt-in rail + Settings. */
function renderPortal({ dockable = true }: { dockable?: boolean } = {}) {
  return render(
    <AxisAssistant managerName="Jordan Lee" dockable={dockable}>
      <AssistantDisplayModeSetting />
      <PortalAssistantDockRail managerName="Jordan Lee" />
    </AxisAssistant>,
  );
}

const rail = () => document.querySelector('[data-attr="portal-assistant-dock-rail"]');
const dock = () => document.querySelector('[data-attr="dashboard-assistant-dock"]');
const fab = () => document.querySelector('[data-attr="axis-assistant-fab"]');

describe("assistant display mode", () => {
  beforeEach(() => {
    // `isDemoModeActive()` keys off the pathname, and jsdom starts at "/" —
    // which IS a demo surface. Sit on a real portal route so the dock is offered.
    window.history.replaceState({}, "", "/portal");
    installFakeStorage();
    // jsdom has no layout, so `Element.scrollTo` is missing entirely.
    Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to the popup: the FAB is the only assistant surface, no rail", async () => {
    renderPortal();
    await waitFor(() => expect(fab()).not.toBeNull());
    expect(rail()).toBeNull();
    expect(dock()).toBeNull();
    // The FAB is the assistant at every width on the default.
    expect(fab()!.className).not.toContain("lg:hidden");
  });

  it("pins from the popup header, and the FAB steps aside on desktop", async () => {
    renderPortal();
    fireEvent.click(screen.getByLabelText("Open PropLane Assistant"));

    const pin = await screen.findByLabelText("Pin PropLane Assistant to the right side");
    fireEvent.click(pin);

    await waitFor(() => expect(rail()).not.toBeNull());
    expect(dock()).not.toBeNull();
    expect(readAssistantDisplayMode(USER)).toBe("docked");
    // Small screens keep the popup — the rail itself is `hidden lg:flex`.
    expect(rail()!.className).toContain("hidden");
    expect(rail()!.className).toContain("lg:flex");
    await waitFor(() => expect(fab()!.className).toContain("lg:hidden"));
  });

  it("unpins from the dock header, back to the popup default", async () => {
    renderPortal();
    fireEvent.click(screen.getByLabelText("Open PropLane Assistant"));
    fireEvent.click(await screen.findByLabelText("Pin PropLane Assistant to the right side"));
    await waitFor(() => expect(rail()).not.toBeNull());

    fireEvent.click(
      screen.getByLabelText("Unpin PropLane Assistant, use the floating popup instead"),
    );

    await waitFor(() => expect(rail()).toBeNull());
    expect(readAssistantDisplayMode(USER)).toBe("popup");
  });

  it("switches both ways from Settings, and the choice survives a remount", async () => {
    const first = renderPortal();
    const docked = await screen.findByRole("radio", { name: /Pinned to the right/ });
    expect(docked).toHaveProperty("ariaChecked", "false");
    fireEvent.click(docked);

    await waitFor(() => expect(rail()).not.toBeNull());
    expect(readAssistantDisplayMode(USER)).toBe("docked");

    // A reload reads the stored preference back.
    first.unmount();
    renderPortal();
    await waitFor(() => expect(rail()).not.toBeNull());
    expect(
      await screen.findByRole("radio", { name: /Pinned to the right/ }),
    ).toHaveProperty("ariaChecked", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Floating popup/ }));
    await waitFor(() => expect(rail()).toBeNull());
    expect(readAssistantDisplayMode(USER)).toBe("popup");
  });

  it("offers no dock affordance in a portal that did not opt in", async () => {
    renderPortal({ dockable: false });
    await waitFor(() => expect(fab()).not.toBeNull());

    // No Settings toggle...
    expect(screen.queryByRole("radio", { name: /Pinned to the right/ })).toBeNull();
    // ...and no pin control in the popup.
    fireEvent.click(screen.getByLabelText("Open PropLane Assistant"));
    await screen.findByText("PropLane Assistant");
    expect(screen.queryByLabelText("Pin PropLane Assistant to the right side")).toBeNull();

    // Even a preference stored by another surface cannot summon the rail here.
    expect(rail()).toBeNull();
  });
});
