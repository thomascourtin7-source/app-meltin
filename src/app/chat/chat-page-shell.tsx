"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { ChatPageViewportProvider } from "@/components/chat/chat-page-viewport-context";

/**
 * Synchronise la hauteur du conteneur avec `visualViewport` et calcule
 * `viewportOffset` pour coller la barre de saisie au clavier (voir aussi `page.tsx`).
 *
 * `bottom` du composer fixe ≈ `max(0, innerHeight - offsetTop - visualViewport.height)`.
 */
export function ChatPageShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [viewportOffset, setViewportOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const h = vv.height;
      setHeightPx(h);
      const el = rootRef.current;
      if (el) {
        el.style.height = `${h}px`;
        el.style.maxHeight = `${h}px`;
      }
      // Écart bas layout ↔ bas viewport visible (clavier / barre accessoire)
      const offset = Math.max(
        0,
        window.innerHeight - vv.offsetTop - vv.height
      );
      setViewportOffset(offset);
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <ChatPageViewportProvider value={{ viewportOffset }}>
      <div
        ref={rootRef}
        className="relative flex w-full min-w-0 flex-col overflow-hidden bg-white"
        style={{
          height: heightPx ?? undefined,
          minHeight: heightPx == null ? "100dvh" : undefined,
        }}
      >
        {children}
      </div>
    </ChatPageViewportProvider>
  );
}
