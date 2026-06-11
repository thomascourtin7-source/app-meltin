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

/** Client : trim + espaces compactés + minuscules (composant de la clé mission). */
export function normalizeClientIdentity(client: string): string {
  return normPart(client).toLowerCase();
}

/**
 * Clé composite (date + vol + RDV + CLIENT) — repli historique quand la
 * mission n'a PAS d'ID natif (colonne « Id » absente / vide).
 *
 * ⚠️ Le client est intégré pour que DEUX clients différents sur le même vol à
 * la même heure (ex. AF754 06:30) restent des missions TOTALEMENT indépendantes
 * (assignations / rapports distincts). Sans lui, les missions « jumelles »
 * partageaient le même `service_id` et leurs agents étaient liés.
 */
export function compositeMissionIdentityKey(row: DailyServiceRow): string {
  const date = normalizeCanonicalDateKey(normPart(row.dateIso).toLowerCase());
  const vol = normalizeVolIdentity(row.vol);
  const rdv = normalizeServiceRdvIdentity(row);
  const client = normalizeClientIdentity(row.client);
  return [date, vol, rdv, client].join("|");
}

/**
 * Identifiant mission CANONIQUE = valeur BRUTE de la colonne K (Id du Sheet),
 * ex. `260601-TIM-ARRIVEE-64`. C'est la clé primaire ABSOLUE pour insérer /
 * mettre à jour les services et les assignations dans Supabase.
 *
 * ⚠️ Plus AUCUN ID composite/calculé (nom client, vol, RDV) n'est généré ici.
 * Les lignes sans Id (colonne K vide) sont ignorées en amont par le parser, donc
 * un `service_id` reste stable même si on corrige le nom, le vol, le type ou le
 * téléphone → l'agent assigné ne disparaît plus.
 *
 * `compositeMissionIdentityKey` ne sert PLUS qu'au repli de LECTURE
 * (rétro-compat des assignations créées avant la colonne K, via
 * `serviceLookupIdsFromRow`) et aux feuilles dépourvues de colonne « Id ».
 */
export function serviceMissionIdentityKey(row: DailyServiceRow): string {
  const nativeId = normPart(row.sheetId);
  if (nativeId) return nativeId;
  // Feuille sans colonne « Id » uniquement (legacy) : évite un service_id vide.
  return compositeMissionIdentityKey(row);
}

/**
 * Ancienne clé mission (date + vol + RDV, SANS client) : conservée comme repli
 * de lecture pour retrouver les assignations/rapports créés avant l'ajout du
 * client. Ambiguë par nature (partagée par les missions jumelles) : à n'utiliser
 * que lorsqu'elle ne désigne qu'UNE seule ligne (garde-fou côté lecture).
 */
export function legacyMissionIdentityKeyNoClient(row: DailyServiceRow): string {
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
    // Repli : clé composite (assignations/rapports créés avant l'ID natif).
    compositeMissionIdentityKey(row),
    legacyMissionIdentityKeyNoClient(row),
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
  // Clé mission : 3 segments (legacy sans client) ou 4 segments (avec client).
  if (parts.length === 3 || parts.length === 4) {
    const [dateRaw, volRaw, rdvRaw, clientRaw] = parts;
    const date = normalizeCanonicalDateKey(dateRaw.toLowerCase());
    const vol = normalizeVolIdentity(volRaw);
    const rdv = rdvRaw
      .toLowerCase()
      .replace(/[^a-z0-9:,]/g, "")
      .replace(/\b(\d{1,2}):(\d{2}):00\b/g, "$1:$2");
    // Le client n'est comparé que si les DEUX clés le possèdent : une clé à 3
    // segments et une à 4 ne sont JAMAIS équivalentes (missions jumelles).
    if (parts.length === 4) {
      return [date, vol, rdv, normPart(clientRaw).toLowerCase()].join("|");
    }
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

/**
 * Version algo identité (migration snapshot cron sans spam).
 * v3 : ajout du client dans la clé mission (date|vol|rdv|client).
 * v4 : priorité à l'ID natif du Sheet (colonne « Id ») comme clé canonique.
 */
export const PLANNING_IDENTITY_ALGO_VERSION = 4;
