// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GeneralAssistantFab } from "@/components/general/general-assistant";

vi.mock("@/hooks/use-is-native-app", () => ({ useIsNativeApp: () => ({ isNative: false, platform: null }) }));

afterEach(cleanup);

describe("GeneralAssistantFab", () => {
  it("renders a bottom-right chat trigger on public pages", () => {
    render(<GeneralAssistantFab />);
    expect(screen.getByRole("button", { name: "Ask PropLane" })).toHaveAttribute(
      "data-attr",
      "general-assistant-fab",
    );
  });
});
