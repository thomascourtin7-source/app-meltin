import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import {
  compositeMissionIdentityKey,
  legacyMissionIdentityKeyNoClient,
  legacyStableServiceRowKey,
  serviceMissionIdentityKey,
} from "@/lib/planning/service-row-keys";
import { detectServiceReportKind } from "@/lib/planning/service-kind";

function normPart(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Ancien `service_id` (date + type + client + vol). */
export function legacyServiceReportIdFromRow(row: DailyServiceRow): string {
  const kind = detectServiceReportKind(row.type);
  const date = normalizeCanonicalDateKey(normPart(row.dateIso));
  return [date, kind, normPart(row.client), normPart(row.vol)].join("|");
}

/** Identifiant Supabase canonique : date + vol + RDV normalisés. */
export function serviceReportIdFromRow(row: DailyServiceRow): string {
  return serviceMissionIdentityKey(row);
}

/** Tous les identifiants possibles pour charger / retrouver une mission en base. */
export function serviceLookupIdsFromRow(row: DailyServiceRow): string[] {
  const ids = [
    serviceReportIdFromRow(row),
    // Repli : clé composite date|vol|rdv|client (assignations/rapports créés
    // AVANT l'ID natif du Sheet) → migration transparente vers l'ID natif.
    compositeMissionIdentityKey(row),
    // Repli : ancienne clé canonique sans client (assignations/rapports
    // créés avant l'ajout du client dans la clé). Ambiguë pour les missions
    // jumelles → neutralisée côté lecture par le compteur de références.
    legacyMissionIdentityKeyNoClient(row),
    legacyServiceReportIdFromRow(row),
    legacyStableServiceRowKey(row),
  ];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}
