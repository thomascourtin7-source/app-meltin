import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";

/** Compare la colonne date de la ligne à aujourd’hui / demain (calendrier local navigateur). */
export function planningDayBucket(
  dateIso: string,
  todayYmd: string,
  tomorrowYmd: string
): "today" | "tomorrow" | "other" {
  const rk = normalizeCanonicalDateKey(dateIso);
  if (rk === todayYmd) return "today";
  if (rk === tomorrowYmd) return "tomorrow";
  return "other";
}

/** Libellé court FR pour le titre push (ex. « 19 avr. 2026 »). */
export function formatPlanningDateForNotification(dateKey: string): string {
  const k = normalizeCanonicalDateKey(dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return dateKey;
  const d = new Date(`${k}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
