"use client";

import type { CSSProperties, ReactNode, UIEventHandler } from "react";

/**
 * Enveloppe la zone scrollable des messages : un tap sur le fond (hors bulles)
 * appelle onActivate (ex. blur du textarea pour faire redescendre le clavier).
 */
export function InvisibleCloseLayer({
  scrollRef,
  enabled,
  onActivate,
  onScroll,
  className,
  style,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onActivate: () => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      className={className}
      style={style}
      onScroll={onScroll}
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
