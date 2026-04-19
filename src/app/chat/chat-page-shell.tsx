"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Hauteur = `visualViewport.height` pour que la colonne messages se rétrécisse
 * avec le clavier. Le scroll bas est géré dans le composant Chat via VisualViewport.
 */
export function ChatPageShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const syncHeight = () => {
      const h = vv.height;
      setHeightPx(h);
      const el = rootRef.current;
      if (el) {
        el.style.height = `${h}px`;
        el.style.maxHeight = `${h}px`;
      }
    };

    syncHeight();
    vv.addEventListener("resize", syncHeight);
    vv.addEventListener("scroll", syncHeight);
    window.addEventListener("resize", syncHeight);
    return () => {
      vv.removeEventListener("resize", syncHeight);
      vv.removeEventListener("scroll", syncHeight);
      window.removeEventListener("resize", syncHeight);
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
