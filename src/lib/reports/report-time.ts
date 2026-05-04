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
