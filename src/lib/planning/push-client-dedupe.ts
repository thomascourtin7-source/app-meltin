const STORAGE_KEY = "meltin_planning_push_dedupe_v1";

type Entry = { hash: string; ts: number };

function pruneStore(store: Record<string, Entry>, maxAgeMs: number): void {
  const now = Date.now();
  for (const k of Object.keys(store)) {
    if (now - store[k].ts > maxAgeMs) delete store[k];
  }
}

/**
 * Évite les boucles de notifications : une seule fois par changement réel (même hash).
 * `logicalKey` identifie le canal (ex. delta par jour) ; `payloadHash` le contenu du changement.
 */
export function canSendPlanningPushDedupe(
  logicalKey: string,
  payloadHash: string,
  minIntervalMs: number,
  maxStoreAgeMs = 48 * 60 * 60 * 1000
): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const store = raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
    pruneStore(store, maxStoreAgeMs);
    const now = Date.now();
    const prev = store[logicalKey];
    if (
      prev &&
      prev.hash === payloadHash &&
      now - prev.ts < minIntervalMs
    ) {
      return false;
    }
    store[logicalKey] = { hash: payloadHash, ts: now };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return true;
  }
}
