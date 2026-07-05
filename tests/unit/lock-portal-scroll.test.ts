// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lockPortalScroll } from "@/lib/native/lock-portal-scroll";
import { DEMO_PORTAL_SCROLL_ID, PORTAL_MAIN_CONTENT_ID } from "@/lib/portal-layout-classes";

describe("lockPortalScroll", () => {
  let main: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
    main = document.createElement("main");
    main.id = PORTAL_MAIN_CONTENT_ID;
    main.style.overflow = "";
    document.body.appendChild(main);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
  });

  it("locks body and portal main scroll while active", () => {
    main.scrollTop = 120;
    const unlock = lockPortalScroll();
    expect(document.body.style.overflow).toBe("hidden");
    expect(main.style.overflow).toBe("hidden");

    unlock();
    expect(document.body.style.overflow).toBe("");
    expect(main.style.overflow).toBe("");
    expect(main.scrollTop).toBe(120);
  });

  it("supports nested locks with a single unlock at the end", () => {
    const unlockA = lockPortalScroll();
    const unlockB = lockPortalScroll();
    expect(document.body.style.overflow).toBe("hidden");

    unlockA();
    expect(document.body.style.overflow).toBe("hidden");

    unlockB();
    expect(document.body.style.overflow).toBe("");
  });

  it("locks demo frame scroll without locking body on /demo", () => {
    const demoScroll = document.createElement("div");
    demoScroll.id = DEMO_PORTAL_SCROLL_ID;
    demoScroll.style.overflow = "";
    demoScroll.scrollTop = 64;
    document.body.appendChild(demoScroll);

    const originalPath = window.location.pathname;
    window.history.pushState({}, "", "/demo");

    const unlock = lockPortalScroll();
    expect(document.body.style.overflow).toBe("");
    expect(demoScroll.style.overflow).toBe("hidden");

    unlock();
    expect(demoScroll.style.overflow).toBe("");
    expect(demoScroll.scrollTop).toBe(64);

    window.history.pushState({}, "", originalPath || "/");
  });
});
