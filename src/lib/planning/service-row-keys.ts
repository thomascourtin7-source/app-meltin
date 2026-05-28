import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { parseTime } from "@/lib/planning/time-conflicts";

const IDENTITY_LOG_PREFIX = "[service-identity]";

function normPart(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Vol : minuscules, sans espaces/signes, zéros inutiles (`AF0063` = `AF 63`). */
export function normalizeVolIdentity(vol: string): string {
  const compact = normPart(vol)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!compact) return "";
  const m = compact.match(/^([a-z]{2,3})(\d+)$/);
  if (m) {
    const num = Number.parseInt(m[2]!, 10);
    if (Number.isFinite(num)) return `${m[1]}${num}`;
  }
  return compact;
}

/**
 * RDV : heures en `HH:mm` (`06:10` = `06:10:00`), texte sans caractères spéciaux.
 */
export function normalizeServiceRdvIdentity(row: DailyServiceRow): string {
  const block = `${row.rdv1 ?? ""} ${row.rdv2 ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:h ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(\d{1,2}):(\d{2}):00\b/g, "$1:$2");

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
  return block;
}

/**
 * Identifiant mission : date + vol + RDV (insensible à la position dans le Sheet).
 */
export function serviceMissionIdentityKey(row: DailyServiceRow): string {
  const date = normalizeCanonicalDateKey(normPart(row.dateIso).toLowerCase());
  const vol = normalizeVolIdentity(row.vol);
  const rdv = normalizeServiceRdvIdentity(row);
  return [date, vol, rdv].join("|");
}

/** Clé stable UI / snapshot cron (alignée sur `service_id` canonique). */
export function stableServiceRowKey(row: DailyServiceRow): string {
  return serviceMissionIdentityKey(row);
}

export function serviceUrgencyIdentityKey(row: DailyServiceRow): string {
  return serviceMissionIdentityKey(row);
}

/** Ancienne clé UI (date + client + type + vol). */
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

/** Toutes les clés connues pour une ligne (snapshots, repli Supabase). */
export function collectSnapshotIdentityKeys(row: DailyServiceRow): string[] {
  const keys = [
    serviceMissionIdentityKey(row),
    legacyStableServiceRowKey(row),
    legacyServiceUrgencyIdentityKey(row),
  ];
  return [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
}

/** Compare deux clés stockées (tolère changement de formatage vol/RDV). */
export function identityKeysEquivalent(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return normalizeIdentityKeyForCompare(x) === normalizeIdentityKeyForCompare(y);
}

function normalizeIdentityKeyForCompare(key: string): string {
  const parts = key.split("|").map((p) => p.trim());
  if (parts.length === 3) {
    const [dateRaw, volRaw, rdvRaw] = parts;
    const date = normalizeCanonicalDateKey(dateRaw.toLowerCase());
    const vol = normalizeVolIdentity(volRaw);
    const rdv = rdvRaw
      .toLowerCase()
      .replace(/[^a-z0-9:,]/g, "")
      .replace(/\b(\d{1,2}):(\d{2}):00\b/g, "$1:$2");
    return [date, vol, rdv].join("|");
  }
  return key.trim().toLowerCase();
}

/** Une ligne Sheet correspond-elle à une clé déjà vue (ancien ou nouveau format) ? */
export function rowMatchesStoredIdentityKey(
  row: DailyServiceRow,
  storedKey: string
): boolean {
  const target = storedKey.trim();
  if (!target) return false;
  for (const candidate of collectSnapshotIdentityKeys(row)) {
    if (identityKeysEquivalent(candidate, target)) return true;
  }
  return false;
}

export function rowKnownInIdentitySet(
  row: DailyServiceRow,
  known: ReadonlySet<string>
): boolean {
  for (const key of collectSnapshotIdentityKeys(row)) {
    if (known.has(key)) return true;
    for (const prev of known) {
      if (identityKeysEquivalent(key, prev)) return true;
    }
  }
  return false;
}

export function findRowForStoredIdentityKey(
  rows: DailyServiceRow[],
  storedKey: string
): DailyServiceRow | null {
  const target = storedKey.trim();
  if (!target) return null;
  return rows.find((row) => rowMatchesStoredIdentityKey(row, target)) ?? null;
}

/** Une clé snapshot précédente existe-t-elle encore dans le Sheet (évite faux « vol retiré ») ? */
export function resolveCurrentStableKeyForStoredKey(
  storedKey: string,
  dateKey: string,
  rows: DailyServiceRow[],
  nextByDate: Record<string, string>
): string | null {
  const dk = normalizeCanonicalDateKey(dateKey);
  if (storedKey in nextByDate) return storedKey;

  const dayRows = rows.filter(
    (r) => normalizeCanonicalDateKey(r.dateIso) === dk
  );
  for (const row of dayRows) {
    if (!rowMatchesStoredIdentityKey(row, storedKey)) continue;
    const current = stableServiceRowKey(row);
    if (current in nextByDate) return current;
    return current;
  }
  return null;
}

export function logIdentityMatchFailure(
  context: string,
  detail: Record<string, unknown>
): void {
  console.warn(`${IDENTITY_LOG_PREFIX} ${context}`, detail);
}

/** Version algo identité (migration snapshot cron sans spam). */
export const PLANNING_IDENTITY_ALGO_VERSION = 2;
