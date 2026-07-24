// @vitest-environment jsdom
//
// The manager Settings-page control for the assistant display mode. It is a
// third entry point over the SAME shipped `dock-store` preference the in-
// assistant pin/unpin buttons drive, so this test asserts it reads and writes
// that store: default is the floating popup, each option flips `getAssistantDocked`,
// it is hidden in /demo, and small screens keep the popup with an explanatory note.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

let demoActive = false;
let smallViewport = false;

vi.mock("@/lib/demo/demo-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo/demo-session")>()),
  isDemoModeActive: () => demoActive,
}));

vi.mock("@/hooks/use-is-native-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-is-native-app")>()),
  useIsSmallPortalViewport: () => smallViewport,
}));

import { AssistantDisplaySetting } from "@/components/portal/assistant-display-setting";
import {
  getAssistantDocked,
  initAssistantDockState,
} from "@/lib/axis-assistant/dock-store";

const popupBtn = () => document.querySelector('[data-attr="assistant-display-popup"]') as HTMLButtonElement | null;
const dockedBtn = () => document.querySelector('[data-attr="assistant-display-docked"]') as HTMLButtonElement | null;

describe("AssistantDisplaySetting", () => {
  beforeEach(() => {
    demoActive = false;
    smallViewport = false;
    // Reset the shipped dock-store singleton to its shipped defaults (popup).
    initAssistantDockState({ collapsed: true, docked: false });
  });

  afterEach(() => cleanup());

  it("defaults to the floating popup and reflects the shipped store", () => {
    render(<AssistantDisplaySetting />);
    expect(getAssistantDocked()).toBe(false);
    expect(popupBtn()!.getAttribute("aria-checked")).toBe("true");
    expect(dockedBtn()!.getAttribute("aria-checked")).toBe("false");
  });

  it("pins to the rail and back, driving getAssistantDocked both ways", () => {
    render(<AssistantDisplaySetting />);

    fireEvent.click(dockedBtn()!);
    expect(getAssistantDocked()).toBe(true);
    expect(dockedBtn()!.getAttribute("aria-checked")).toBe("true");
    expect(popupBtn()!.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(popupBtn()!);
    expect(getAssistantDocked()).toBe(false);
    expect(popupBtn()!.getAttribute("aria-checked")).toBe("true");
  });

  it("renders nothing in the /demo sandbox", () => {
    demoActive = true;
    const { container } = render(<AssistantDisplaySetting />);
    expect(container).toBeEmptyDOMElement();
  });

  it("still offers the control on small screens but explains the popup is used", () => {
    smallViewport = true;
    render(<AssistantDisplaySetting />);
    expect(popupBtn()).not.toBeNull();
    expect(dockedBtn()).not.toBeNull();
    expect(screen.getByText(/no room for a side panel/i)).toBeTruthy();
  });

  it("exposes an accessible radiogroup with roving tabindex", () => {
    render(<AssistantDisplaySetting />);
    expect(screen.getByRole("radiogroup", { name: /assistant display/i })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(popupBtn()!.tabIndex).toBe(0);
    expect(dockedBtn()!.tabIndex).toBe(-1);
  });

  it("moves the selection with arrow keys", () => {
    render(<AssistantDisplaySetting />);
    const group = screen.getByRole("radiogroup", { name: /assistant display/i });

    popupBtn()!.focus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(getAssistantDocked()).toBe(true);
    expect(dockedBtn()!.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(dockedBtn());

    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(getAssistantDocked()).toBe(false);
    expect(document.activeElement).toBe(popupBtn());
  });

  it("shows each option's description as visible text", () => {
    render(<AssistantDisplaySetting />);
    expect(screen.getByText(/opens the assistant over your work/i)).toBeTruthy();
    expect(screen.getByText(/full-height panel stays open beside the portal/i)).toBeTruthy();
  });

  it("picks up the cookie-backed state seeded after it mounts", () => {
    render(<AssistantDisplaySetting />);
    expect(popupBtn()!.getAttribute("aria-checked")).toBe("true");

    // The rail seeds the SSR cookie value from an effect that runs AFTER this
    // control (it is rendered after {children} in the portal layout).
    act(() => {
      initAssistantDockState({ collapsed: false, docked: true });
    });

    expect(dockedBtn()!.getAttribute("aria-checked")).toBe("true");
    expect(popupBtn()!.getAttribute("aria-checked")).toBe("false");
  });
});
