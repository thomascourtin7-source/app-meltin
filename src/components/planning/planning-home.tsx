"use client";

import { Suspense } from "react";

import { DailyServicesView } from "@/components/planning/daily-services-view";
import { Loader2 } from "lucide-react";

export function PlanningHome() {
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
