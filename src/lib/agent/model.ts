/**
 * Latest, most capable Claude model for the interactive tool-calling agent.
 * Overridable via env for cost tuning without a code change.
 */
export const AGENT_MODEL = process.env.AXIS_AGENT_MODEL?.trim() || "claude-opus-4-8";
