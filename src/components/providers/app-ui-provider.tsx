"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "@/components/ui/modal";

type Toast = { id: number; message: string };

type AppUiContextValue = {
  toasts: Toast[];
  showToast: (message: string) => void;
  modal: { title: string; body: string } | null;
  openModal: (payload: { title: string; body: string }) => void;
  closeModal: () => void;
};

const AppUiContext = createContext<AppUiContextValue | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<{ title: string; body: string } | null>(
    null,
  );

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const openModal = useCallback((payload: { title: string; body: string }) => {
    setModal(payload);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      modal,
      openModal,
      closeModal,
    }),
    [toasts, showToast, modal, openModal, closeModal],
  );

  return (
    <AppUiContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg"
          >
            {t.message}
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(modal)}
        title={modal?.title ?? ""}
        onClose={closeModal}
      >
        <p className="text-sm text-muted">{modal?.body}</p>
      </Modal>
    </AppUiContext.Provider>
  );
}

export function useAppUi() {
  const ctx = useContext(AppUiContext);
  if (!ctx) {
    throw new Error("useAppUi must be used within AppUiProvider");
  }
  return ctx;
}
