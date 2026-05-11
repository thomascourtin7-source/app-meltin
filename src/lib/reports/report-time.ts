/** Heure locale HH:MM:SS pour colonnes Postgres `time`. */
export function formatLocalTimeHHMMSS(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Affichage lisible d’une valeur `time` (souvent "HH:MM:SS" depuis Supabase).
 */
export function formatTimeForDisplay(value: string | null | undefined): string {
  const t = String(value ?? "").trim();
  if (!t) return "—";
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return t;
  const h = m[1].padStart(2, "0");
  const min = m[2];
  const sec = m[3];
  return sec ? `${h}:${min}:${sec}` : `${h}:${min}`;
}

/** Valeur `HH:mm` pour `<input type="time" />` à partir d’une colonne Postgres `time`. */
export function timeToTimeInputValue(value: string | null | undefined): string {
  const t = String(value ?? "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** `HH:mm` saisi → `HH:mm:00` pour `meeting_time` / `end_of_service`. */
export function postgresTimeFromTimeInput(hhmm: string): string | null {
  const v = hhmm.trim();
  if (!v) return null;
  if (!/^\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00`;
}
