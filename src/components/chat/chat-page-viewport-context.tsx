"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

/** Pixels entre le bas du layout viewport et le bas du VisualViewport (clavier iOS). */
export type ChatPageViewportValue = {
  viewportOffset: number;
};

const ChatPageViewportContext = createContext<ChatPageViewportValue | null>(
  null
);

export function ChatPageViewportProvider({
  value,
  children,
}: {
  value: ChatPageViewportValue;
  children: ReactNode;
}) {
  return (
    <ChatPageViewportContext.Provider value={value}>
      {children}
    </ChatPageViewportContext.Provider>
  );
}

/** `null` si le chat n’est pas sous `/chat` (ex. variante desktop). */
export function useChatPageViewport(): ChatPageViewportValue | null {
  return useContext(ChatPageViewportContext);
}
