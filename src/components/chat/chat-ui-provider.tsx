"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ChatUIState = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const ChatUIContext = createContext<ChatUIState | null>(null);

export function ChatUIProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const value = useMemo(() => ({ mobileOpen, setMobileOpen }), [mobileOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!mobileOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [mobileOpen]);

  return <ChatUIContext.Provider value={value}>{children}</ChatUIContext.Provider>;
}

export function useChatUI() {
  const ctx = useContext(ChatUIContext);
  if (!ctx) {
    throw new Error("useChatUI must be used within <ChatUIProvider />");
  }
  return ctx;
}

