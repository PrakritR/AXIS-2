"use client";

import { createContext, useContext, type ReactNode } from "react";

export type PortalAssistantConfig = {
  endpoint: string;
  managerName: string | null;
};

const PortalAssistantConfigContext = createContext<PortalAssistantConfig | null>(null);

export function PortalAssistantConfigProvider({
  endpoint,
  managerName,
  children,
}: PortalAssistantConfig & { children: ReactNode }) {
  return (
    <PortalAssistantConfigContext.Provider value={{ endpoint, managerName }}>
      {children}
    </PortalAssistantConfigContext.Provider>
  );
}

export function usePortalAssistantConfig(): PortalAssistantConfig | null {
  return useContext(PortalAssistantConfigContext);
}
