"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Enveloppe la zone scrollable des messages : un tap sur le fond (hors bulles)
 * appelle onActivate (ex. blur du textarea pour faire redescendre le clavier).
 */
export function InvisibleCloseLayer({
  scrollRef,
  enabled,
  onActivate,
  className,
  style,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onActivate: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      className={className}
      style={style}
      onClick={(e) => {
        if (!enabled) return;
        if (e.target !== e.currentTarget) return;
        onActivate();
      }}
    >
      {children}
    </div>
  );
}
