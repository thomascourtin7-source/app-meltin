import type { DailyServiceRow } from "@/lib/planning/daily-services-types";

/**
 * Identité métier : date + client + vol + RDV (détection nouvelle ligne).
 */
export function serviceUrgencyIdentityKey(row: DailyServiceRow): string {
  return [row.dateIso, row.client, row.vol, row.rdv1, row.rdv2]
    .map((s) => String(s ?? "").trim())
    .join("|");
}

/**
 * Clé stable par ligne (sans index feuille).
 */
export function stableServiceRowKey(row: DailyServiceRow): string {
  return [
    row.dateIso,
    row.client,
    row.type,
    row.vol,
    row.destProv,
    row.rdv1,
    row.rdv2,
    row.tel,
    row.driverInfo,
  ]
    .map((s) => String(s ?? "").trim())
    .join("|");
}
