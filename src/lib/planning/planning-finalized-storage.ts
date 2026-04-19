import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";

const STORAGE_KEY = "meltin_planning_tomorrow_finalized_v1";

/** Clé explicite demandée côté produit : `planning_validated_YYYY-MM-DD`. */
export const PLANNING_VALIDATED_PREFIX = "planning_validated_";

function addDaysLocal(d: Date, delta: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + delta);
  return n;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date de service « demain » (YYYY-MM-DD), alignée sur le sélecteur du planning. */
export function getTomorrowPlanningDateKey(): string {
  return normalizeCanonicalDateKey(
    formatLocalYmd(addDaysLocal(new Date(), 1))
  );
}

function readStore(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== "object") return {};
    return p as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

/** Marque le planning de la journée de service `ymd` comme validé (notif globale envoyée). */
export function markPlanningFinalizedForServiceDate(ymd: string): void {
  const key = normalizeCanonicalDateKey(ymd);
  const store = readStore();
  store[key] = true;
  writeStore(store);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`${PLANNING_VALIDATED_PREFIX}${key}`, "true");
    } catch {
      /* quota */
    }
  }
}

export function isPlanningValidatedForDateString(ymd: string): boolean {
  if (typeof window === "undefined") return false;
  const key = normalizeCanonicalDateKey(ymd);
  try {
    if (window.localStorage.getItem(`${PLANNING_VALIDATED_PREFIX}${key}`) === "true") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function isPlanningFinalizedForServiceDate(ymd: string): boolean {
  const key = normalizeCanonicalDateKey(ymd);
  if (!!readStore()[key]) return true;
  return isPlanningValidatedForDateString(key);
}

/** Permet une nouvelle session « préparation » depuis la configuration. */
export function clearPlanningFinalizedForServiceDate(ymd: string): void {
  const key = normalizeCanonicalDateKey(ymd);
  const store = readStore();
  delete store[key];
  writeStore(store);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(`${PLANNING_VALIDATED_PREFIX}${key}`);
    } catch {
      /* ignore */
    }
  }
}
