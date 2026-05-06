"use client";

import { Suspense, useEffect } from "react";

import { DailyServicesView } from "@/components/planning/daily-services-view";
import { Loader2 } from "lucide-react";

export function PlanningHome() {
  // Écran propre à l'arrivée : ferme toute Sheet/Dialog éventuellement restée ouverte
  // (cas rare iOS/PWA où un backdrop peut rester monté après navigation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fireEscape = () => {
      try {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
      } catch {
        /* ignore */
      }
    };
    // Plusieurs ticks pour fermer des overlays empilés.
    fireEscape();
    const t1 = window.setTimeout(fireEscape, 50);
    const t2 = window.setTimeout(fireEscape, 150);
    const t3 = window.setTimeout(fireEscape, 300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Chargement du planning…
        </div>
      }
    >
      <DailyServicesView />
    </Suspense>
  );
}
