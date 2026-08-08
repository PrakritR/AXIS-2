import { describe, expect, it, beforeEach, vi } from "vitest";

function installSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
}

describe("resident compose prefill", () => {
  beforeEach(() => {
    vi.resetModules();
    installSessionStorage();
  });

  it("stages and consumes a draft once", async () => {
    const { stageResidentComposePrefill, consumeResidentComposePrefill } = await import(
      "@/lib/resident-compose-prefill"
    );
    stageResidentComposePrefill({
      subject: "Question about rent",
      body: "Hi,\n\n",
      managerUserId: "mgr-1",
      propertyId: "prop-1",
    });
    expect(consumeResidentComposePrefill()).toEqual({
      subject: "Question about rent",
      body: "Hi,\n\n",
      managerUserId: "mgr-1",
      propertyId: "prop-1",
    });
    expect(consumeResidentComposePrefill()).toBeNull();
  });
});
