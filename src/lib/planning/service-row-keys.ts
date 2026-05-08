import type { DailyServiceRow } from "@/lib/planning/daily-services-types";

/**
 * Identité métier : date + client + vol + RDV (détection nouvelle ligne).
 */
export function serviceUrgencyIdentityKey(row: DailyServiceRow): string {
  // Identité stable (ne pas inclure RDV/tel/dest…) : un changement d’heure ne doit pas créer un “nouveau service”.
  return [row.dateIso, row.client, row.vol]
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
  ]
    .map((s) => String(s ?? "").trim())
    .join("|");
}
