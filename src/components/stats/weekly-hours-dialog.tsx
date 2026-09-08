"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import type { AgentWeeklyHoursGroup } from "@/lib/planning/planning-stats";
import { Button } from "@/components/ui/button";

export function formatStatsHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(".", ",");
  return `${text} h`;
}

type WeeklyHoursDialogProps = {
  agent: string;
  groups: AgentWeeklyHoursGroup[];
  onClose: () => void;
};

export function WeeklyHoursDialog({
  agent,
  groups,
  onClose,
}: WeeklyHoursDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showMonthHeaders = groups.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-hours-title"
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="weekly-hours-title"
              className="text-base font-semibold tracking-tight"
            >
              Heures travaillées
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {agent}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune heure calculable pour cette période.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.monthKey}>
                {showMonthHeaders ? (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.monthLabel}
                  </p>
                ) : null}
                <ul className="space-y-1.5">
                  {group.weeks.map((week) => (
                    <li
                      key={`${group.monthKey}-${week.label}`}
                      className="rounded-lg bg-muted/40 px-3 py-2 text-sm tabular-nums"
                    >
                      {week.label} = {formatStatsHours(week.hours)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
