import { describe, expect, it } from "vitest";
import {
  closeAxisAssistant,
  getAxisAssistantOpen,
  openAxisAssistant,
  setAxisAssistantOpen,
  subscribeAxisAssistantOpen,
} from "@/lib/axis-assistant/open-store";

describe("axis-assistant open-store", () => {
  it("tracks open state and notifies subscribers", () => {
    setAxisAssistantOpen(false);
    const seen: boolean[] = [];
    const unsubscribe = subscribeAxisAssistantOpen(() => {
      seen.push(getAxisAssistantOpen());
    });

    openAxisAssistant();
    expect(getAxisAssistantOpen()).toBe(true);
    expect(seen).toEqual([true]);

    closeAxisAssistant();
    expect(getAxisAssistantOpen()).toBe(false);
    expect(seen).toEqual([true, false]);

    unsubscribe();
  });
});
