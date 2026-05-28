import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import {
  legacyStableServiceRowKey,
  serviceMissionIdentityKey,
} from "@/lib/planning/service-row-keys";
import { detectServiceReportKind } from "@/lib/planning/service-kind";

function normPart(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Ancien `service_id` (date + type + client + vol) — conservé pour retrouver
 * les assignations / rapports déjà en base avant la clé date+vol+RDV.
 */
export function legacyServiceReportIdFromRow(row: DailyServiceRow): string {
  const kind = detectServiceReportKind(row.type);
  const date = normalizeCanonicalDateKey(normPart(row.dateIso));
  return [date, kind, normPart(row.client), normPart(row.vol)].join("|");
}

/**
 * Identifiant Supabase d’une mission : date + vol + heure RDV (stable si la ligne bouge dans le Sheet).
 */
export function serviceReportIdFromRow(row: DailyServiceRow): string {
  return serviceMissionIdentityKey(row);
}

/** Tous les identifiants possibles pour une ligne (nouveau + anciens formats). */
export function serviceLookupIdsFromRow(row: DailyServiceRow): string[] {
  const ids = [
    serviceReportIdFromRow(row),
    legacyServiceReportIdFromRow(row),
    legacyStableServiceRowKey(row),
  ];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}
