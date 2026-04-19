import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  PLANNING_URGENT_ASSIGNEE_SLUG,
  isUrgentAssignee,
} from "@/lib/planning/planning-team";

/** Minutes depuis minuit [0, 24*60). */
export type MinuteInterval = { start: number; end: number };

function toMinutes(hStr: string, mStr: string): number | null {
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Toutes les occurrences de type HH:mm ou HHhmm dans le texte, en ordre d’apparition
 * (minutes depuis minuit).
 */
export function parseTime(text: string): number[] {
  const s = text ?? "";
  const out: number[] = [];
  const re = /\b(\d{1,2})(?::|h)(\d{2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const mins = toMinutes(m[1]!, m[2]!);
    if (mins !== null) out.push(mins);
  }
  return out;
}

/** Première heure HH:mm / HHhmm (rétrocompat). */
export function extractFirstTimeMinutes(cell: string): number | null {
  const all = parseTime(cell);
  return all.length > 0 ? all[0]! : null;
}

function normalizeTypeField(typeRaw: string | undefined): string {
  return (typeRaw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Mots alphanumériques (évite « deconnexion » ≈ connexion). */
function typeTokens(norm: string): string[] {
  return norm.split(/[^a-z0-9]+/).filter(Boolean);
}

type ServiceKind = "arrivée" | "départ" | "connexion_40" | null;

function detectServiceKind(typeRaw: string | undefined): ServiceKind {
  const type = normalizeTypeField(typeRaw);
  const tokens = typeTokens(type);
  if (tokens.includes("depart")) return "départ";
  if (tokens.includes("arrivee")) return "arrivée";
  if (tokens.includes("connexion") || tokens.includes("transit")) {
    return "connexion_40";
  }
  return null;
}

/** Bloc horaire combiné (RDV 1 + RDV 2). */
function serviceTimeBlock(row: DailyServiceRow): string {
  return `${row.rdv1 ?? ""} ${row.rdv2 ?? ""}`.trim();
}

/**
 * Pour un DÉPART : heure servant à calculer la fin d’occupation (RDV 2 − 30 min) :
 * — heure juste après « RDV » dans le bloc, sinon
 * — la 2e heure HH:mm / HHhmm du bloc.
 */
function findDepartEndAnchorMinutes(block: string): number | null {
  const lower = block.toLowerCase();
  const rdvIdx = lower.search(/rdv/i);
  if (rdvIdx >= 0) {
    const after = block.slice(rdvIdx + 3);
    const timesAfter = parseTime(after);
    if (timesAfter.length > 0) return timesAfter[0]!;
  }
  const all = parseTime(block);
  if (all.length >= 2) return all[1]!;
  return null;
}

/**
 * Règles :
 * - Arrivée : 1 h à partir de la 1re heure du bloc.
 * - Connexion / Transit : 40 min à partir de la 1re heure.
 * - Départ : de la 1re heure jusqu’à (ancre fin RDV 2) − 30 min.
 */
export function getBusyIntervalForRow(row: DailyServiceRow): MinuteInterval | null {
  const kind = detectServiceKind(row.type);
  if (!kind) return null;

  const block = serviceTimeBlock(row);
  const times = parseTime(block);
  if (times.length === 0) return null;

  if (kind === "arrivée") {
    const start = times[0]!;
    return { start, end: start + 60 };
  }

  if (kind === "connexion_40") {
    const start = times[0]!;
    return { start, end: start + 40 };
  }

  /* départ */
  const start = times[0]!;
  const anchorEnd = findDepartEndAnchorMinutes(block);
  if (anchorEnd === null) return null;
  const end = anchorEnd - 30;
  if (end <= start) return null;
  return { start, end };
}

/** Chevauchement : max(start1, start2) < min(end1, end2). */
function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function isCountableAssignee(slug: string): boolean {
  return (
    slug !== DEFAULT_PLANNING_ASSIGNEE_SLUG &&
    slug !== PLANNING_URGENT_ASSIGNEE_SLUG &&
    !isUrgentAssignee(slug)
  );
}

/**
 * Clés de lignes (stable row key) où au moins un assigné réel a un chevauchement
 * avec un autre service (ligne différente).
 */
export function computeConflictRowKeys(
  rowKeysAndRows: Array<{ rowKey: string; row: DailyServiceRow }>,
  assigneesByRowKey: Record<string, string[]>
): Set<string> {
  type Piece = {
    rowKey: string;
    interval: MinuteInterval;
    slug: string;
  };

  const pieces: Piece[] = [];

  for (const { rowKey, row } of rowKeysAndRows) {
    const interval = getBusyIntervalForRow(row);
    if (!interval) continue;
    const list = assigneesByRowKey[rowKey];
    if (!list?.length) continue;
    for (const slug of list) {
      if (!isCountableAssignee(slug)) continue;
      pieces.push({ rowKey, interval, slug });
    }
  }

  const conflict = new Set<string>();

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      if (a.slug !== b.slug) continue;
      if (a.rowKey === b.rowKey) continue;
      const ov = intervalsOverlap(a.interval, b.interval);
      if (!ov) continue;
      conflict.add(a.rowKey);
      conflict.add(b.rowKey);
    }
  }

  return conflict;
}
