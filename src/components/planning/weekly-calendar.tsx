"use client";

import { useMemo } from "react";

import type { Person, Shift } from "@/lib/planning/types";
import { addDays, formatIsoDate, startOfIsoWeek } from "@/lib/planning/week";
import { cn } from "@/lib/utils";

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

type WeeklyCalendarProps = {
  anchorDate: Date;
  people: Person[];
  shifts: Shift[];
  personFilter: "all" | string;
};

export function WeeklyCalendar({
  anchorDate,
  people,
  shifts,
  personFilter,
}: WeeklyCalendarProps) {
  const weekStart = useMemo(() => startOfIsoWeek(anchorDate), [anchorDate]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const visiblePeople = useMemo(() => {
    const active = people.filter((p) => p.active);
    const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (personFilter === "all") return sorted;
    return sorted.filter((p) => p.personId === personFilter);
  }, [people, personFilter]);

  const shiftsByPersonDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const k = `${s.personId}::${s.date}`;
      const cur = map.get(k);
      if (cur) cur.push(s);
      else map.set(k, [s]);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [shifts]);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 z-20 min-w-[128px] border-r border-border bg-muted/95 px-3 py-2 text-left font-medium backdrop-blur">
              Équipe
            </th>
            {days.map((d) => (
              <th
                key={d.getTime()}
                className="px-2 py-2 text-center font-medium capitalize text-foreground"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {dayFmt.format(d)}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiblePeople.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                Aucune personne à afficher. Vérifiez l’onglet{" "}
                <span className="font-mono">People</span> dans le sheet.
              </td>
            </tr>
          ) : (
            visiblePeople.map((person) => (
              <tr
                key={person.personId}
                className="border-b border-border/80 last:border-0 hover:bg-muted/20"
              >
                <td className="sticky left-0 z-10 border-r border-border bg-background/95 px-3 py-2 align-top font-medium backdrop-blur">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: person.color ?? "var(--primary)",
                      }}
                      aria-hidden
                    />
                    <span className="truncate">{person.name}</span>
                  </span>
                </td>
                {days.map((d) => {
                  const iso = formatIsoDate(d);
                  const key = `${person.personId}::${iso}`;
                  const cellShifts = shiftsByPersonDay.get(key) ?? [];
                  return (
                    <td
                      key={iso}
                      className="align-top px-1.5 py-2 text-xs leading-snug text-foreground"
                    >
                      <div className="flex min-h-[52px] flex-col gap-1">
                        {cellShifts.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          cellShifts.map((s) => (
                            <div
                              key={s.shiftId}
                              className={cn(
                                "rounded-lg border border-border/80 bg-muted/30 px-2 py-1.5",
                                person.color &&
                                  "border-l-[3px]"
                              )}
                              style={
                                person.color
                                  ? { borderLeftColor: person.color }
                                  : undefined
                              }
                            >
                              <div className="font-medium text-foreground">
                                {s.start} – {s.end}
                              </div>
                              {s.label ? (
                                <div className="text-muted-foreground">
                                  {s.label}
                                </div>
                              ) : null}
                              {s.notes ? (
                                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                  {s.notes}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
