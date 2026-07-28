/**
 * DOM id of the docked assistant's composer.
 *
 * Its own module so the top bar can look for the dock without importing the
 * dock component (and pulling the whole conversation loop into the shell's
 * bundle). At most one dock is mounted at a time, so the id stays unique.
 */
export const ASSISTANT_DOCK_INPUT_ID = "assistant-dock-input";
