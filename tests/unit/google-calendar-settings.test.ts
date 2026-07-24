import { describe, expect, it, vi } from "vitest";

import {
  discoverGoogleOAuthClientId,
  googleCalendarPublicStatus,
  normalizeGoogleCalendarConnection,
  resolveGoogleCalendarOAuthConfig,
} from "@/lib/google-calendar/settings";

describe("google calendar settings — per-manager isolation", () => {
  it("normalizes disconnected state without tokens", () => {
    const connection = normalizeGoogleCalendarConnection({ connected: false, email: null });
    expect(connection.connected).toBe(false);
    expect(connection.refreshToken).toBeNull();
    expect(connection.syncEnabled).toBe(true);
  });

  it("requires a refresh token before marking connected", () => {
    const connection = normalizeGoogleCalendarConnection({ connected: true, email: "a@b.com" });
    expect(connection.connected).toBe(false);
  });

  it("keeps each manager connection independent in public status", () => {
    const managerA = googleCalendarPublicStatus(
      normalizeGoogleCalendarConnection({
        connected: true,
        refreshToken: "rt_a",
        email: "manager-a@example.com",
      }),
    );
    const managerB = googleCalendarPublicStatus(
      normalizeGoogleCalendarConnection({
        connected: true,
        refreshToken: "rt_b",
        email: "manager-b@example.com",
      }),
    );
    expect(managerA.email).toBe("manager-a@example.com");
    expect(managerB.email).toBe("manager-b@example.com");
    expect(managerA.perManager).toBe(true);
    expect(managerB.perManager).toBe(true);
  });

  it("reports oauth unconfigured when env vars are absent", () => {
    const prevId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    try {
      expect(resolveGoogleCalendarOAuthConfig()).toBeNull();
      expect(
        googleCalendarPublicStatus(normalizeGoogleCalendarConnection(null)).configured,
      ).toBe(false);
    } finally {
      if (prevId) process.env.GOOGLE_CALENDAR_CLIENT_ID = prevId;
      if (prevSecret) process.env.GOOGLE_CALENDAR_CLIENT_SECRET = prevSecret;
    }
  });

  it("discovers google client id from supabase authorize redirect", async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const prevId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      headers: {
        get: () =>
          "https://accounts.google.com/o/oauth2/v2/auth?client_id=discovered-client.apps.googleusercontent.com",
      },
    })) as typeof fetch;

    try {
      const id = await discoverGoogleOAuthClientId();
      expect(id).toBe("discovered-client.apps.googleusercontent.com");
      expect(resolveGoogleCalendarOAuthConfig()).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (prevAnon) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
      else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (prevId) process.env.GOOGLE_CALENDAR_CLIENT_ID = prevId;
      else delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    }
  });
});
