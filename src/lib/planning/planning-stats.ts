import { DateTime } from "luxon";

import {
  PLANNING_ASSIGNEE_OPTIONS,
  PLANNING_URGENT_ASSIGNEE_DISPLAY,
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  assigneeSlugToNotifyLabel,
  isUrgentAssignee,
  displayAgents,
  parseAssigneeNameToSlugs,
  planningDisplayNameEquals,
} from "@/lib/planning/planning-team";
import { detectServiceReportKind } from "@/lib/planning/service-kind";
import { parseTime } from "@/lib/planning/time-conflicts";

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
  if (/^non assign[ée]$/i.test(t) || t === "__none__" || t === "null") {
    return null;
  }
  for (const o of PLANNING_ASSIGNEE_OPTIONS) {
    if (o.value === "__none__" || isUrgentAssignee(o.value)) continue;
    if (planningDisplayNameEquals(o.label, t)) return o.label;
  }
  return t;
}

function isPlaceholderAgentLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return true;
  if (isUrgentAssignee(t) || t === PLANNING_URGENT_ASSIGNEE_DISPLAY) return true;
  if (/^non assign[ée]$/i.test(t) || t === "__none__" || t === "null") return true;
  return false;
}

/**
 * Tous les agents réels d’une assignation (« Deva;Thomas », virgules, « + »).
 * N’utilise pas seulement le premier nom.
 */
export function agentLabelsFromStoredAssigneeName(
  raw: string | null | undefined
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | null | undefined) => {
    const canonical = canonicalAgentLabel(value ?? null);
    if (!canonical || isPlaceholderAgentLabel(canonical)) return;
    const key = canonical.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(canonical);
  };

  const slugs = parseAssigneeNameToSlugs(raw);
  for (const slug of slugs) {
    if (slug === DEFAULT_PLANNING_ASSIGNEE_SLUG || isUrgentAssignee(slug)) {
      continue;
    }
    add(assigneeSlugToNotifyLabel(slug) ?? slug);
  }

  if (raw?.trim()) {
    for (const part of String(raw).split(/[;|,+/]/)) {
      add(part.trim());
    }
  }

  return labels;
}

/** Fusionne plusieurs champs `agent_name` (rapport + planning_assignments). */
export function mergeStoredAssigneeNames(
  ...raws: Array<string | null | undefined>
): string | null {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of raws) {
    for (const label of agentLabelsFromStoredAssigneeName(raw)) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
    }
  }
  return labels.length > 0 ? labels.join(";") : null;
}

/** Rapport comptable comme accueil : complété et/ou No-Show validé. */
export function isStatsCountableReport(row: {
  completed_at?: string | null;
  no_show?: boolean | string | null;
}): boolean {
  const completed = row.completed_at != null && String(row.completed_at).trim() !== "";
  if (completed) return true;
  const noShow = row.no_show;
  if (noShow === true) return true;
  if (typeof noShow === "string") {
    const t = noShow.trim().toLowerCase().replace(/[_ ]+/g, "-");
    if (t === "true" || t === "no-show" || t === "noshow") return true;
  }
  return false;
}

export function defaultScoreAgentLabels(): string[] {
  return displayAgents().map((o) => o.label);
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
    const agents = agentLabelsFromStoredAssigneeName(row.assignee_name);
    if (agents.length === 0) continue;

    const date =
      typeof row.service_date === "string"
        ? row.service_date.slice(0, 10)
        : "";
    const bounds = serviceStartEndMinutes(row);

    for (const agent of agents) {
      agentLabels.add(agent);
      accueils.set(agent, (accueils.get(agent) ?? 0) + 1);

      if (!date) continue;

      const agg = ensureDay(agent, date);
      if (bounds) {
        agg.hasTime = true;
        agg.minStart = Math.min(agg.minStart, bounds.start);
        agg.maxEnd = Math.max(agg.maxEnd, bounds.end);
      }
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

export type StatsHourServiceInput = {
  dateIso: string;
  type: string;
  rdv1: string;
  rdv2: string;
  assignee_name: string | null;
};

export type AgentWeekHours = {
  label: string;
  hours: number;
};

export type AgentWeeklyHoursGroup = {
  monthKey: string;
  monthLabel: string;
  weeks: AgentWeekHours[];
};

function rdvColumnMinutes(cell: string | null | undefined): number | null {
  const times = parseTime(String(cell ?? ""));
  return times.length > 0 ? times[0]! : null;
}

function firstServiceStartMinutes(row: StatsHourServiceInput): number | null {
  return rdvColumnMinutes(row.rdv1) ?? rdvColumnMinutes(`${row.rdv1} ${row.rdv2}`);
}

function lastServiceEndMinutes(row: StatsHourServiceInput): number | null {
  const kind = detectServiceReportKind(row.type);
  if (kind === "arrival") {
    const start = firstServiceStartMinutes(row);
    return start == null ? null : start + 60;
  }
  const rdv2 = rdvColumnMinutes(row.rdv2);
  if (rdv2 != null) return rdv2 - 30;
  const fallback = parseTime(`${row.rdv1} ${row.rdv2}`);
  if (fallback.length >= 2) return fallback[fallback.length - 1]! - 30;
  if (fallback.length === 1) return fallback[0]! - 30;
  return null;
}

/** Durée d’une journée travaillée (minutes), ou null si horaires illisibles. */
export function dailyWorkedMinutesFromServices(
  services: StatsHourServiceInput[]
): number | null {
  if (services.length === 0) return null;
  const sorted = [...services].sort((a, b) => {
    const da = firstServiceStartMinutes(a) ?? Number.POSITIVE_INFINITY;
    const db = firstServiceStartMinutes(b) ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return String(a.rdv1).localeCompare(String(b.rdv1), "fr");
  });
  const start = firstServiceStartMinutes(sorted[0]!);
  const end = lastServiceEndMinutes(sorted[sorted.length - 1]!);
  if (start == null || end == null) return null;
  const duration = end - start;
  if (duration <= 0) return null;
  return duration;
}

/** S1 = semaine contenant le 1er du mois (lundi → dimanche). */
export function weekIndexInCalendarMonth(dateIso: string): number {
  const d = DateTime.fromISO(dateIso.slice(0, 10), { zone: TZ }).startOf("day");
  if (!d.isValid) return 1;
  const first = d.startOf("month");
  return Math.floor((d.day + first.weekday - 2) / 7) + 1;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function monthLabelFr(year: number, month: number): string {
  const d = DateTime.fromObject({ year, month, day: 1 }, { zone: TZ }).setLocale(
    "fr"
  );
  const raw = d.toFormat("LLLL yyyy");
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : d.toFormat("MM/yyyy");
}

/**
 * Heures travaillées par agent et par semaine du mois (S1, S2, …).
 * Une journée = RDV 1 du 1er service → fin du dernier service
 * (arrivée : RDV 1 + 1 h ; départ / transit : RDV 2 − 30 min).
 */
export function computeWeeklyHoursByAgent(
  services: StatsHourServiceInput[],
  rangeStart: string,
  rangeEnd: string,
  agentLabels: string[]
): Record<string, AgentWeeklyHoursGroup[]> {
  const startIso = rangeStart.slice(0, 10);
  const endIso = rangeEnd.slice(0, 10);
  const byAgentDay = new Map<string, Map<string, StatsHourServiceInput[]>>();

  for (const service of services) {
    const date = (service.dateIso ?? "").slice(0, 10);
    if (!date || date < startIso || date > endIso) continue;
    const agents = agentLabelsFromStoredAssigneeName(service.assignee_name);
    if (agents.length === 0) continue;
    for (const agent of agents) {
      if (!byAgentDay.has(agent)) byAgentDay.set(agent, new Map());
      const days = byAgentDay.get(agent)!;
      if (!days.has(date)) days.set(date, []);
      days.get(date)!.push(service);
    }
  }

  const startDt = DateTime.fromISO(startIso, { zone: TZ }).startOf("day");
  const endDt = DateTime.fromISO(endIso, { zone: TZ }).startOf("day");
  const monthKeys: Array<{ year: number; month: number; maxWeek: number }> = [];
  const sameMonth =
    startDt.isValid &&
    endDt.isValid &&
    startDt.year === endDt.year &&
    startDt.month === endDt.month;

  if (sameMonth) {
    const lastOfMonth = startDt.endOf("month").startOf("day");
    monthKeys.push({
      year: startDt.year,
      month: startDt.month,
      maxWeek: weekIndexInCalendarMonth(lastOfMonth.toISODate()!),
    });
  } else {
    const seen = new Set<string>();
    for (const days of byAgentDay.values()) {
      for (const date of days.keys()) {
        const dt = DateTime.fromISO(date, { zone: TZ });
        if (!dt.isValid) continue;
        const key = dt.toFormat("yyyy-LL");
        if (seen.has(key)) continue;
        seen.add(key);
        const monthEnd = DateTime.min(dt.endOf("month").startOf("day"), endDt);
        monthKeys.push({
          year: dt.year,
          month: dt.month,
          maxWeek: weekIndexInCalendarMonth(monthEnd.toISODate()!),
        });
      }
    }
    monthKeys.sort((a, b) => a.year - b.year || a.month - b.month);
  }

  const labels = [...new Set([...agentLabels, ...byAgentDay.keys()])];
  const out: Record<string, AgentWeeklyHoursGroup[]> = {};

  for (const agent of labels) {
    const minuteBuckets = new Map<string, number[]>();
    for (const { year, month, maxWeek } of monthKeys) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      minuteBuckets.set(monthKey, Array.from({ length: maxWeek }, () => 0));
    }
    const days = byAgentDay.get(agent);
    if (days) {
      for (const [date, dayServices] of days) {
        const minutes = dailyWorkedMinutesFromServices(dayServices);
        if (minutes == null || minutes <= 0) continue;
        const dt = DateTime.fromISO(date, { zone: TZ });
        if (!dt.isValid) continue;
        const monthKey = dt.toFormat("yyyy-LL");
        const weekIndex = weekIndexInCalendarMonth(date);
        let bucket = minuteBuckets.get(monthKey);
        if (!bucket) {
          bucket = [];
          minuteBuckets.set(monthKey, bucket);
        }
        while (bucket.length < weekIndex) bucket.push(0);
        bucket[weekIndex - 1] = (bucket[weekIndex - 1] ?? 0) + minutes;
      }
    }
    out[agent] = monthKeys.map(({ year, month, maxWeek }) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const bucket = minuteBuckets.get(monthKey) ?? Array.from({ length: maxWeek }, () => 0);
      return {
        monthKey,
        monthLabel: monthLabelFr(year, month),
        weeks: bucket.map((mins, i) => ({
          label: `S${i + 1}`,
          hours: minutesToHours(mins),
        })),
      };
    });
  }

  return out;
}
