import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { parseTime } from "@/lib/planning/time-conflicts";

function normPart(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeVolForIdentity(vol: string): string {
  return normPart(vol).toUpperCase();
}

/**
 * Heure(s) RDV canonique(s) : `14h30` et `14:30` → même identité.
 * Si aucune heure n’est parsable, on garde le texte RDV normalisé.
 */
export function normalizeServiceRdvIdentity(row: DailyServiceRow): string {
  const block = `${row.rdv1 ?? ""} ${row.rdv2 ?? ""}`.trim();
  const times = parseTime(block);
  if (times.length > 0) {
    return times
      .map((m) => {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      })
      .join(",");
  }
  return normPart(block).toLowerCase();
}

/**
 * Identifiant unique mission (sans numéro de ligne) : date + vol + RDV.
 * Permet de mettre à jour le client (typo) sans perdre l’assignation.
 */
export function serviceMissionIdentityKey(row: DailyServiceRow): string {
  const date = normalizeCanonicalDateKey(normPart(row.dateIso));
  const vol = normalizeVolForIdentity(row.vol);
  const rdv = normalizeServiceRdvIdentity(row);
  return [date, vol, rdv].join("|");
}

/** Clé stable par ligne (alignée sur `service_id` Supabase). */
export function stableServiceRowKey(row: DailyServiceRow): string {
  return serviceMissionIdentityKey(row);
}

/** Détection nouvelle mission (même clé que l’identité mission). */
export function serviceUrgencyIdentityKey(row: DailyServiceRow): string {
  return serviceMissionIdentityKey(row);
}

/** Ancienne clé UI (date + client + type + vol) — repli assignations. */
export function legacyStableServiceRowKey(row: DailyServiceRow): string {
  return [row.dateIso, row.client, row.type, row.vol]
    .map((s) => String(s ?? "").trim())
    .join("|");
}

/** Ancienne clé urgence (date + client + vol). */
export function legacyServiceUrgencyIdentityKey(row: DailyServiceRow): string {
  return [row.dateIso, row.client, row.vol]
    .map((s) => String(s ?? "").trim())
    .join("|");
}
