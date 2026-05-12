import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { detectServiceReportKind } from "@/lib/planning/service-kind";
import {
  assigneeSlugToNotifyLabel,
  normalizeAssigneeListFromStored,
} from "@/lib/planning/planning-team";
import { stableServiceRowKey } from "@/lib/planning/service-row-keys";
import { extractFirstTimeMinutes } from "@/lib/planning/time-conflicts";
import { serviceReportIdFromRow } from "@/lib/reports/service-report-id";

export type AgentBadgeStatus = "red" | "yellow" | "green" | "gray" | "black";

export function slugifyAgentDomId(agentLabel: string): string {
  return (agentLabel || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\\/|:\s]+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildServiceCardDomId(
  agentLabel: string,
  chronologyIndex: number
): string {
  return `service-${slugifyAgentDomId(agentLabel)}-${chronologyIndex}`;
}

function serviceRdvSortKey(row: DailyServiceRow): number {
  const block = `${row.rdv1 ?? ""} ${row.rdv2 ?? ""}`.trim();
  return extractFirstTimeMinutes(block) ?? Number.POSITIVE_INFINITY;
}

export function sortRowsByRdvChronology(
  rows: DailyServiceRow[]
): DailyServiceRow[] {
  return [...rows].sort((a, b) => {
    const diff = serviceRdvSortKey(a) - serviceRdvSortKey(b);
    if (diff !== 0) return diff;
    return a.rdv1.localeCompare(b.rdv1, "fr");
  });
}

export function getAgentAssignedRows(
  agentLabel: string,
  rows: DailyServiceRow[],
  assigneesByRowKey: Record<string, unknown>
): DailyServiceRow[] {
  const assigned = rows.filter((row) => {
    const rowKey = stableServiceRowKey(row);
    const list = normalizeAssigneeListFromStored(assigneesByRowKey[rowKey]);
    return list.some((slug) => assigneeSlugToNotifyLabel(slug) === agentLabel);
  });
  return sortRowsByRdvChronology(assigned);
}

export function getChronologyIndexForAgentRow(
  agentLabel: string,
  targetRow: DailyServiceRow,
  rows: DailyServiceRow[],
  assigneesByRowKey: Record<string, unknown>
): number {
  const agentRows = getAgentAssignedRows(agentLabel, rows, assigneesByRowKey);
  const targetKey = stableServiceRowKey(targetRow);
  const index = agentRows.findIndex(
    (row) => stableServiceRowKey(row) === targetKey
  );
  return index >= 0 ? index : 0;
}

type ServiceReportFlags = {
  isCompletedByServiceId: Record<string, boolean>;
  isPecByServiceId: Record<string, boolean>;
  hasPhotoByServiceId: Record<string, boolean>;
};

function serviceIdFromRow(row: DailyServiceRow): string {
  return serviceReportIdFromRow(row);
}

function currentMinutesLocal(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isInProgressService(
  row: DailyServiceRow,
  flags: ServiceReportFlags
): boolean {
  const serviceId = serviceIdFromRow(row);
  if (flags.isCompletedByServiceId[serviceId]) return false;
  const kind = detectServiceReportKind(row.type);
  const pec = Boolean(flags.isPecByServiceId[serviceId]);
  const photo = Boolean(flags.hasPhotoByServiceId[serviceId]);
  return pec || (photo && kind !== "departure");
}

function isAvailableService(
  row: DailyServiceRow,
  flags: ServiceReportFlags
): boolean {
  const serviceId = serviceIdFromRow(row);
  if (flags.isCompletedByServiceId[serviceId]) return false;
  const kind = detectServiceReportKind(row.type);
  const pec = Boolean(flags.isPecByServiceId[serviceId]);
  const photo = Boolean(flags.hasPhotoByServiceId[serviceId]);
  return !pec && !(photo && kind !== "departure");
}

function pickCurrentInProgressRow(
  rows: DailyServiceRow[],
  flags: ServiceReportFlags
): DailyServiceRow | null {
  const candidates = rows.filter((row) => isInProgressService(row, flags));
  if (candidates.length === 0) return null;

  const nowMinutes = currentMinutesLocal();
  let bestPast: DailyServiceRow | null = null;
  let bestPastMinutes = Number.NEGATIVE_INFINITY;

  for (const row of candidates) {
    const minutes = serviceRdvSortKey(row);
    if (minutes <= nowMinutes && minutes >= bestPastMinutes) {
      bestPast = row;
      bestPastMinutes = minutes;
    }
  }

  return bestPast ?? candidates[0] ?? null;
}

function pickNextAvailableRow(
  rows: DailyServiceRow[],
  flags: ServiceReportFlags
): DailyServiceRow | null {
  const candidates = rows.filter((row) => isAvailableService(row, flags));
  if (candidates.length === 0) return null;

  const nowMinutes = currentMinutesLocal();
  const upcoming = candidates.find((row) => serviceRdvSortKey(row) >= nowMinutes);
  return upcoming ?? candidates[0] ?? null;
}

function pickLastCompletedRow(
  rows: DailyServiceRow[],
  flags: ServiceReportFlags
): DailyServiceRow | null {
  const candidates = rows.filter(
    (row) => Boolean(flags.isCompletedByServiceId[serviceIdFromRow(row)])
  );
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1] ?? null;
}

export function resolveAgentBadgeScrollTarget(opts: {
  agentLabel: string;
  status: AgentBadgeStatus;
  rows: DailyServiceRow[];
  assigneesByRowKey: Record<string, unknown>;
  isCompletedByServiceId: Record<string, boolean>;
  isPecByServiceId: Record<string, boolean>;
  hasPhotoByServiceId: Record<string, boolean>;
}): { row: DailyServiceRow; chronologyIndex: number } | null {
  if (opts.status === "black") return null;

  const agentRows = getAgentAssignedRows(
    opts.agentLabel,
    opts.rows,
    opts.assigneesByRowKey
  );
  if (agentRows.length === 0) return null;

  const flags: ServiceReportFlags = {
    isCompletedByServiceId: opts.isCompletedByServiceId,
    isPecByServiceId: opts.isPecByServiceId,
    hasPhotoByServiceId: opts.hasPhotoByServiceId,
  };

  let targetRow: DailyServiceRow | null = null;
  if (opts.status === "red" || opts.status === "yellow") {
    targetRow = pickCurrentInProgressRow(agentRows, flags);
  } else if (opts.status === "green") {
    targetRow = pickNextAvailableRow(agentRows, flags);
  } else if (opts.status === "gray") {
    targetRow = pickLastCompletedRow(agentRows, flags);
  }

  if (!targetRow) return null;

  return {
    row: targetRow,
    chronologyIndex: getChronologyIndexForAgentRow(
      opts.agentLabel,
      targetRow,
      opts.rows,
      opts.assigneesByRowKey
    ),
  };
}

export function scrollToAgentBadgeTarget(opts: {
  agentLabel: string;
  status: AgentBadgeStatus;
  rows: DailyServiceRow[];
  assigneesByRowKey: Record<string, unknown>;
  isCompletedByServiceId: Record<string, boolean>;
  isPecByServiceId: Record<string, boolean>;
  hasPhotoByServiceId: Record<string, boolean>;
}): boolean {
  const target = resolveAgentBadgeScrollTarget(opts);
  if (!target) return false;

  const domId = buildServiceCardDomId(
    opts.agentLabel,
    target.chronologyIndex
  );
  const element = document.getElementById(domId);
  if (!element) return false;

  element.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}
