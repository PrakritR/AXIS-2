import { appendFileSync } from "node:fs";

const LOG_PATH = "/Users/prakrit/firstmate/.cursor/debug-81cbea.log";

export function debugGoogleCalendarLog(location: string, message: string, data: Record<string, unknown>): void {
  // #region agent log
  try {
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({
        sessionId: "81cbea",
        location,
        message,
        data,
        timestamp: Date.now(),
        hypothesisId: "H4",
        runId: "auto-link-v3",
      })}\n`,
    );
  } catch {
    /* ignore logging failures */
  }
  // #endregion
}
