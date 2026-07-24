// @vitest-environment jsdom
//
// The manager Settings-page control for the assistant display mode. It is a
// third entry point over the SAME shipped `dock-store` preference the in-
// assistant pin/unpin buttons drive, so this test asserts it reads and writes
// that store: default is the floating popup, each option flips `getAssistantDocked`,
// it is hidden in /demo, and small screens keep the popup with an explanatory note.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

  it("exposes an accessible radiogroup", () => {
    render(<AssistantDisplaySetting />);
    expect(screen.getByRole("radiogroup", { name: /assistant display/i })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
