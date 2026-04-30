import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { detectServiceReportKind } from "@/lib/planning/service-kind";

function normPart(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Identifiant "métier" d'un service pour les rapports.
 *
 * Important: on évite d'inclure des champs "volatiles" (tél, driverInfo, destProv, etc.)
 * qui peuvent changer légèrement après coup et casser le matching planning ↔ Supabase.
 */
export function serviceReportIdFromRow(row: DailyServiceRow): string {
  const kind = detectServiceReportKind(row.type);
  const date = normalizeCanonicalDateKey(normPart(row.dateIso));
  return [
    date,
    kind,
    normPart(row.client),
    normPart(row.vol),
    normPart(row.rdv1),
    normPart(row.rdv2),
  ].join("|");
}

