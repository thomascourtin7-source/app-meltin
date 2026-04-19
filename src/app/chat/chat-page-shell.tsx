"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { CHAT_VIEWPORT_RESIZE_EVENT } from "@/lib/chat/constants";

/**
 * Hauteur = `visualViewport.height` pour que la colonne messages se rétrécisse
 * avec le clavier. Émet {@link CHAT_VIEWPORT_RESIZE_EVENT} pour déclencher le scroll bas.
 */
export function ChatPageShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const updateScroll = () => {
      const h = vv.height;
      setHeightPx(h);
      const el = rootRef.current;
      if (el) {
        el.style.height = `${h}px`;
        el.style.maxHeight = `${h}px`;
      }
      window.dispatchEvent(new CustomEvent(CHAT_VIEWPORT_RESIZE_EVENT));
    };

    updateScroll();
    vv.addEventListener("resize", updateScroll);
    vv.addEventListener("scroll", updateScroll);
    window.addEventListener("resize", updateScroll);
    return () => {
      vv.removeEventListener("resize", updateScroll);
      vv.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex w-full min-w-0 flex-col overflow-hidden bg-white"
      style={{
        height: heightPx ?? undefined,
        minHeight: heightPx == null ? "100dvh" : undefined,
      }}
    >
      {children}
    </div>
  );
}
