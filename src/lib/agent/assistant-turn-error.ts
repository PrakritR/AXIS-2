import Anthropic from "@anthropic-ai/sdk";

/**
 * Dead-end copy — do not return this to users. Use {@link formatAgentChatUserError}.
 */
export const GENERIC_ASSISTANT_ERROR_DEAD_END =
  "The assistant ran into an error. Please try again." as const;

export type AssistantTurnFailure = {
  message: string;
  httpStatus: number;
};

function attachmentOrContextHint(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("image") ||
    lower.includes("pdf") ||
    lower.includes("document") ||
    lower.includes("token") ||
    lower.includes("context") ||
    lower.includes("too long") ||
    lower.includes("maximum")
  );
}

function mapAssistantTurnFailure(error: unknown): AssistantTurnFailure {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      return {
        message: "The AI service is busy right now. Wait about a minute and try again.",
        httpStatus: 429,
      };
    }
    if (error.status === 529 || error.status === 503) {
      return {
        message: "The AI service is temporarily overloaded. Please try again in a minute.",
        httpStatus: 503,
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        message:
          "The assistant is temporarily unavailable. If this keeps happening, contact PropLane support.",
        httpStatus: 503,
      };
    }
    if (error.status === 413 || error.status === 400) {
      if (attachmentOrContextHint(error.message)) {
        if (error.message.toLowerCase().includes("token") || error.message.toLowerCase().includes("context")) {
          return {
            message:
              "This conversation is too long for one turn. Start a new chat or ask about one thing at a time.",
            httpStatus: 400,
          };
        }
        return {
          message:
            "That attachment could not be processed. Try a smaller JPEG or PNG, or send your question without the file.",
          httpStatus: 400,
        };
      }
    }
  }

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return {
        message: "That took too long. Try a shorter question or fewer attachments.",
        httpStatus: 504,
      };
    }
    if (lower.includes("fetch failed") || lower.includes("econnreset") || lower.includes("network")) {
      return {
        message: "Could not reach the AI service. Check your connection and try again.",
        httpStatus: 503,
      };
    }
    if (lower.includes("could not upload") || lower.includes("listing photo")) {
      return {
        message: "We could not save your photos. Try again or use smaller images.",
        httpStatus: 500,
      };
    }
  }

  return {
    message:
      "I could not finish that request. Try again, shorten your message, or remove attachments. If it keeps failing, start a new chat.",
    httpStatus: 500,
  };
}

/** Map an internal failure to a safe, actionable user message (no secrets / stack traces). */
export function formatAgentChatUserError(error: unknown): AssistantTurnFailure {
  return mapAssistantTurnFailure(error);
}

/** @deprecated Use {@link formatAgentChatUserError}. */
export function userFacingAssistantError(error: unknown): AssistantTurnFailure {
  return formatAgentChatUserError(error);
}

export function assistantTurnErrorResponse(error: unknown): {
  body: { error: string };
  status: number;
} {
  const { message, httpStatus } = formatAgentChatUserError(error);
  return { body: { error: message }, status: httpStatus };
}

/** Shown in-thread when a proposal could not be persisted for confirm. */
export const PENDING_ACTION_SAVE_FAILED_NOTE =
  "I drafted an action but could not show the confirmation card. Try sending the request again, or complete it from the main portal.";
