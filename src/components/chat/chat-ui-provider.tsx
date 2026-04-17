"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ChatUIState = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const ChatUIContext = createContext<ChatUIState | null>(null);

export function ChatUIProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const value = useMemo(() => ({ mobileOpen, setMobileOpen }), [mobileOpen]);
  return <ChatUIContext.Provider value={value}>{children}</ChatUIContext.Provider>;
}

export function useChatUI() {
  const ctx = useContext(ChatUIContext);
  if (!ctx) {
    throw new Error("useChatUI must be used within <ChatUIProvider />");
  }
  return ctx;
}

