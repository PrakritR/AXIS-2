"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

function filterDraftValuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => Object.is(value, b[index]));
  }
  return Object.is(a, b);
}

type DraftEntry = {
  applied: unknown;
  draft: unknown;
  onApply: (next: unknown) => void;
  resetValue: unknown;
};

type PortalFilterDeferContextValue = {
  register: (
    id: string,
    applied: unknown,
    onApply: (next: unknown) => void,
    resetValue: unknown,
  ) => void;
  unregister: (id: string) => void;
  syncApplied: (id: string, applied: unknown) => void;
  getDraft: <T>(id: string, fallback: T) => T;
  setDraft: <T>(id: string, next: T) => void;
  subscribe: (listener: () => void) => () => void;
  commitAll: () => void;
  resetAll: () => void;
  snapshotFromApplied: () => void;
};

const PortalFilterDeferContext = createContext<PortalFilterDeferContextValue | null>(null);

export function PortalFilterDeferProvider({
  children,
  controllerRef,
}: {
  children: ReactNode;
  controllerRef?: React.MutableRefObject<PortalFilterDeferController | null>;
}) {
  const entriesRef = useRef(new Map<string, DraftEntry>());
  const listenersRef = useRef(new Set<() => void>());
  const [, bump] = useState(0);

  const notify = useCallback(() => {
    bump((n) => n + 1);
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const register = useCallback(
    (id: string, applied: unknown, onApply: (next: unknown) => void, resetValue: unknown) => {
      const existing = entriesRef.current.get(id);
      entriesRef.current.set(id, {
        applied,
        draft: existing?.draft ?? applied,
        onApply,
        resetValue,
      });
    },
    [],
  );

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  const syncApplied = useCallback((id: string, applied: unknown) => {
    const entry = entriesRef.current.get(id);
    if (!entry) return;
    entry.applied = applied;
  }, []);

  const getDraft = useCallback(<T,>(id: string, fallback: T): T => {
    const entry = entriesRef.current.get(id);
    if (!entry) return fallback;
    return entry.draft as T;
  }, []);

  const setDraft = useCallback(
    <T,>(id: string, next: T) => {
      const entry = entriesRef.current.get(id);
      if (!entry) return;
      entry.draft = next;
      notify();
    },
    [notify],
  );

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const commitAll = useCallback(() => {
    for (const entry of entriesRef.current.values()) {
      if (filterDraftValuesEqual(entry.draft, entry.applied)) continue;
      const next = entry.draft;
      entry.applied = next;
      startTransition(() => {
        entry.onApply(next);
      });
    }
  }, []);

  const resetAll = useCallback(() => {
    let changed = false;
    for (const entry of entriesRef.current.values()) {
      if (filterDraftValuesEqual(entry.draft, entry.resetValue)) continue;
      entry.draft = entry.resetValue;
      changed = true;
    }
    if (changed) notify();
  }, [notify]);

  const snapshotFromApplied = useCallback(() => {
    let changed = false;
    for (const entry of entriesRef.current.values()) {
      if (filterDraftValuesEqual(entry.draft, entry.applied)) continue;
      entry.draft = entry.applied;
      changed = true;
    }
    if (changed) notify();
  }, [notify]);

  const controller: PortalFilterDeferController = {
    commitAll,
    resetAll,
    snapshotFromApplied,
  };

  if (controllerRef) {
    controllerRef.current = controller;
  }

  const value = useMemo<PortalFilterDeferContextValue>(
    () => ({
      register,
      unregister,
      syncApplied,
      getDraft,
      setDraft,
      subscribe,
      commitAll,
      resetAll,
      snapshotFromApplied,
    }),
    [
      register,
      unregister,
      syncApplied,
      getDraft,
      setDraft,
      subscribe,
      commitAll,
      resetAll,
      snapshotFromApplied,
    ],
  );

  return <PortalFilterDeferContext.Provider value={value}>{children}</PortalFilterDeferContext.Provider>;
}

export type PortalFilterDeferController = {
  commitAll: () => void;
  resetAll: () => void;
  snapshotFromApplied: () => void;
};

/**
 * While inside an open {@link PortalFilterSortSheet}, edits stay in a draft until the
 * sheet closes (X, backdrop, or another control). Outside the sheet, changes apply immediately.
 */
export function usePortalFilterDraft<T>(
  applied: T,
  onApply: (next: T) => void,
  resetValue: T,
): [T, (next: T) => void] {
  const id = useId();
  const ctx = useContext(PortalFilterDeferContext);
  const [, setTick] = useState(0);

  if (ctx) {
    ctx.register(id, applied, onApply as (next: unknown) => void, resetValue);
  }

  useLayoutEffect(() => {
    if (!ctx) return;
    return () => ctx.unregister(id);
  }, [ctx, id]);

  useLayoutEffect(() => {
    ctx?.syncApplied(id, applied);
  }, [ctx, id, applied]);

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(() => setTick((n) => n + 1));
  }, [ctx]);

  if (!ctx) {
    return [applied, onApply];
  }

  const draft = ctx.getDraft(id, applied);
  const setDraft = (next: T) => ctx.setDraft(id, next);
  return [draft, setDraft];
}
