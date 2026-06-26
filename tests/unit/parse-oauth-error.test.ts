import { describe, expect, it } from "vitest";
import { friendlyOAuthErrorMessage, parseOAuthErrorFromUrl } from "@/lib/auth/parse-oauth-error";

describe("parseOAuthErrorFromUrl", () => {
  it("reads error from query string", () => {
    const result = parseOAuthErrorFromUrl(
      "https://www.axis-seattle-housing.com/?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code",
    );
    expect(result?.error).toBe("server_error");
    expect(result?.errorCode).toBe("unexpected_failure");
    expect(result?.errorDescription).toContain("Unable to exchange external code");
  });

  it("reads error from hash fragment", () => {
    const result = parseOAuthErrorFromUrl(
      "https://www.axis-seattle-housing.com/#error=server_error&error_description=access_denied",
    );
    expect(result?.error).toBe("server_error");
    expect(result?.errorDescription).toBe("access_denied");
  });

  it("returns null when no error", () => {
    expect(parseOAuthErrorFromUrl("https://www.axis-seattle-housing.com/")).toBeNull();
  });
});

describe("friendlyOAuthErrorMessage", () => {
  it("explains exchange external code failures", () => {
    const message = friendlyOAuthErrorMessage({
      error: "server_error",
      errorCode: "unexpected_failure",
      errorDescription: "Unable to exchange external code: 4/0A",
    });
    expect(message).toContain("Supabase");
    expect(message).toContain("Google Client ID");
  });
});
