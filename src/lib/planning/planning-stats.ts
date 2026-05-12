import { DateTime } from "luxon";

import {
  PLANNING_ASSIGNEE_OPTIONS,
  isUrgentAssignee,
  planningBadgeAgentOptions,
  planningDisplayNameEquals,
} from "@/lib/planning/planning-team";

/** Fuseau pour mois calendaires et jours OFF. */
const TZ = "Europe/Paris";

export type PlanningStatsPeriod = "current_month" | "last_month" | "total";

export type PlanningStatsPeriodMeta = {
  key: PlanningStatsPeriod;
  start: string;
  end: string;
  labelFr: string;
};

const NOON_MINUTES = 12 * 60;

export function planningStatsPeriodMeta(
  p: PlanningStatsPeriod
): PlanningStatsPeriodMeta {
  const now = DateTime.now().setZone(TZ);
  const today = now.toISODate()!;
  if (p === "current_month") {
    return {
      key: p,
      start: now.startOf("month").toISODate()!,
      end: today,
      labelFr: "Ce mois-ci",
    };
  }
  if (p === "last_month") {
    const prev = now.minus({ months: 1 });
    return {
      key: p,
      start: prev.startOf("month").toISODate()!,
      end: prev.endOf("month").toISODate()!,
      labelFr: "Mois dernier",
    };
  }
  return {
    key: p,
    start: "2000-01-01",
    end: today,
    labelFr: "Total",
  };
}

export function enumerateIsoDatesInclusive(
  startIso: string,
  endIso: string
): string[] {
  let d = DateTime.fromISO(startIso, { zone: TZ }).startOf("day");
  const end = DateTime.fromISO(endIso, { zone: TZ }).startOf("day");
  const out: string[] = [];
  while (d <= end) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}

export type StatsReportInput = {
  assignee_name: string | null;
  service_date: string;
  meeting_time: string | null;
  end_of_service: string | null;
  service_started_at: string | null;
};

export function timeStringToMinutes(t: string | null | undefined): number | null {
  if (t == null || typeof t !== "string") return null;
  const s = t.trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** Début / fin d’un service pour bornes journée (meeting_time, end_of_service, repli service_started_at). */
export function serviceStartEndMinutes(
  r: StatsReportInput
): { start: number; end: number } | null {
  const startStr = r.meeting_time ?? r.service_started_at;
  const endStr = r.end_of_service ?? r.meeting_time ?? r.service_started_at;
  const a = timeStringToMinutes(startStr);
  const b = timeStringToMinutes(endStr);
  if (a === null && b === null) return null;
  const start = a ?? b!;
  const end = b ?? a!;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * - Matin : tout se termine strictement avant 12h00.
 * - Après-midi : tout commence strictement après 12h00.
 * - Journée entière : premier début &lt; 12h et dernière fin &gt; 12h.
 */
export function classifyWorkday(
  firstStartMin: number,
  lastEndMin: number
): "matin" | "apres_midi" | "journee" {
  if (lastEndMin < NOON_MINUTES) return "matin";
  if (firstStartMin > NOON_MINUTES) return "apres_midi";
  if (firstStartMin < NOON_MINUTES && lastEndMin > NOON_MINUTES) {
    return "journee";
  }
  if (firstStartMin <= NOON_MINUTES && lastEndMin <= NOON_MINUTES) {
    return "matin";
  }
  return "apres_midi";
}

export function canonicalAgentLabel(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  for (const o of PLANNING_ASSIGNEE_OPTIONS) {
    if (o.value === "__none__" || isUrgentAssignee(o.value)) continue;
    if (planningDisplayNameEquals(o.label, t)) return o.label;
  }
  return t;
}

export function defaultScoreAgentLabels(): string[] {
  return planningBadgeAgentOptions().map((o) => o.label);
}

export type PlanningScoreRow = {
  agent: string;
  accueils: number;
  matins: number;
  apresMidi: number;
  journeesEntieres: number;
  joursOff: number;
};

type DayAgg = { minStart: number; maxEnd: number; hasTime: boolean };

export function computePlanningScores(
  rows: StatsReportInput[],
  rangeStart: string,
  rangeEnd: string
): PlanningScoreRow[] {
  const accueils = new Map<string, number>();
  const dayMap = new Map<string, Map<string, DayAgg>>();
  const agentLabels = new Set(defaultScoreAgentLabels());

  const ensureDay = (agent: string, date: string): DayAgg => {
    if (!dayMap.has(agent)) dayMap.set(agent, new Map());
    const m = dayMap.get(agent)!;
    if (!m.has(date)) {
      m.set(date, {
        minStart: 24 * 60,
        maxEnd: 0,
        hasTime: false,
      });
    }
    return m.get(date)!;
  };

  for (const row of rows) {
    const agent = canonicalAgentLabel(row.assignee_name);
    if (!agent) continue;
    agentLabels.add(agent);
    accueils.set(agent, (accueils.get(agent) ?? 0) + 1);

    const date =
      typeof row.service_date === "string"
        ? row.service_date.slice(0, 10)
        : "";
    if (!date) continue;

    const bounds = serviceStartEndMinutes(row);
    const agg = ensureDay(agent, date);
    if (bounds) {
      agg.hasTime = true;
      agg.minStart = Math.min(agg.minStart, bounds.start);
      agg.maxEnd = Math.max(agg.maxEnd, bounds.end);
    }
  }

  const matins = new Map<string, number>();
  const apresMidi = new Map<string, number>();
  const journees = new Map<string, number>();

  for (const [agent, dates] of dayMap) {
    for (const [, agg] of dates) {
      if (!agg.hasTime) continue;
      const kind = classifyWorkday(agg.minStart, agg.maxEnd);
      if (kind === "matin") {
        matins.set(agent, (matins.get(agent) ?? 0) + 1);
      } else if (kind === "apres_midi") {
        apresMidi.set(agent, (apresMidi.get(agent) ?? 0) + 1);
      } else {
        journees.set(agent, (journees.get(agent) ?? 0) + 1);
      }
    }
  }

  const calendarDays = enumerateIsoDatesInclusive(rangeStart, rangeEnd).length;

  const sortedAgents = [...agentLabels].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" })
  );

  return sortedAgents.map((agent) => {
    const workedDays = dayMap.get(agent)?.size ?? 0;
    return {
      agent,
      accueils: accueils.get(agent) ?? 0,
      matins: matins.get(agent) ?? 0,
      apresMidi: apresMidi.get(agent) ?? 0,
      journeesEntieres: journees.get(agent) ?? 0,
      joursOff: Math.max(0, calendarDays - workedDays),
    };
  });
}
