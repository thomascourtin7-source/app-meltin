import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  PLANNING_URGENT_ASSIGNEE_SLUG,
  isUrgentAssignee,
} from "@/lib/planning/planning-team";

/** Minutes depuis minuit [0, 24*60). */
export type MinuteInterval = { start: number; end: number };

/**
 * Extrait la première heure lisible dans une cellule (14:30, 14h30, 9h, etc.).
 */
export function extractFirstTimeMinutes(cell: string): number | null {
  const t = cell.trim();
  if (!t) return null;
  const withMinutes = t.match(/(\d{1,2})[h:](\d{2})/i);
  if (withMinutes) {
    const h = Number.parseInt(withMinutes[1]!, 10);
    const m = Number.parseInt(withMinutes[2]!, 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
  }
  const hourOnly = t.match(/^(\d{1,2})\s*[hH]\s*$/);
  if (hourOnly) {
    const h = Number.parseInt(hourOnly[1]!, 10);
    if (h >= 0 && h <= 23) return h * 60;
  }
  return null;
}

/** Règle métier après normalisation (casse / accents). */
type NormalizedServiceKind = "arrivée" | "départ" | "connexion_40";

/**
 * Harmonise la casse et les accents : comparaisons sur chaîne en minuscules
 * et mots-clés (tokens).
 */
function normalizeServiceKind(raw: string): NormalizedServiceKind | null {
  const serviceType = raw.trim();
  const s = serviceType
    .replace(/\//g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const tokens = s.split(/\s+/).filter(Boolean);

  const has = (keyword: string) =>
    tokens.some((t) => t === keyword) || s === keyword;

  /* Départ en priorité si plusieurs libellés mélangés (rare). */
  if (has("depart")) return "départ";
  if (has("arrivee")) return "arrivée";
  if (has("connexion") || has("transit")) return "connexion_40";

  return null;
}

/**
 * Règles :
 * - Arrivée : occupé 1 h à partir de l’heure du service (RDV 1).
 * - Départ : de l’arrivée (RDV 1) jusqu’à 30 min avant RDV 2.
 * - Connexion / Transit : 40 min à partir de l’heure du service (RDV 1).
 */
export function getBusyIntervalForRow(
  row: DailyServiceRow
): MinuteInterval | null {
  const serviceType = row.type.trim();
  console.log("Type détecté:", serviceType);

  const kind = normalizeServiceKind(row.type);
  if (!kind) return null;

  const t1 = extractFirstTimeMinutes(row.rdv1);
  if (t1 === null) return null;

  if (kind === "arrivée") {
    return { start: t1, end: t1 + 60 };
  }

  if (kind === "connexion_40") {
    return { start: t1, end: t1 + 40 };
  }

  /* départ */
  const t2 = extractFirstTimeMinutes(row.rdv2);
  if (t2 === null) return null;
  const end = t2 - 30;
  if (end <= t1) return null;
  return { start: t1, end };
}

function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.start < b.end && b.start < a.end;
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
      if (!intervalsOverlap(a.interval, b.interval)) continue;
      conflict.add(a.rowKey);
      conflict.add(b.rowKey);
    }
  }

  return conflict;
}
