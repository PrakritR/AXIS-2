"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ASSISTANT_DISPLAY_MODE_EVENT,
  DEFAULT_ASSISTANT_DISPLAY_MODE,
  readAssistantDisplayMode,
  setAssistantDisplayMode,
  type AssistantDisplayMode,
} from "@/lib/assistant-display-preferences";

/**
 * Reactive per-manager assistant display mode. Renders the `popup` default on
 * the server / first paint (so hydration never mismatches), then reconciles to
 * the stored preference after mount and on any change — including one made in
 * another tab, via the native `storage` event.
 *
 * `ready` is false until the stored value has been read, so a surface that would
 * otherwise flash the wrong presentation can wait one paint.
 */
export function useAssistantDisplayMode(userId: string | null | undefined): {
  mode: AssistantDisplayMode;
  setMode: (mode: AssistantDisplayMode) => void;
  ready: boolean;
} {
  const [mode, setModeState] = useState<AssistantDisplayMode>(DEFAULT_ASSISTANT_DISPLAY_MODE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setModeState(readAssistantDisplayMode(userId));
      setReady(true);
    };
    refresh();
    window.addEventListener(ASSISTANT_DISPLAY_MODE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ASSISTANT_DISPLAY_MODE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  const setMode = useCallback(
    (next: AssistantDisplayMode) => setAssistantDisplayMode(userId, next),
    [userId],
  );

  return { mode, setMode, ready };
}
