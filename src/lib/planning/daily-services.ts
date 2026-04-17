import type { DailyServiceRow } from "./daily-services-types";

export type { DailyServiceRow } from "./daily-services-types";

/** Clé unique YYYY-MM-DD pour comparaison au sélecteur `input[type=date]`. */
export function normalizeCanonicalDateKey(isoOrText: string): string {
  let t = (isoOrText ?? "").replace(/\u00a0/g, " ").trim();
  t = t.replace(/\s+/g, "");
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return t;
}

function norm(s: string | undefined | null): string {
  return (s ?? "").trim();
}

function normalizeHeaderCell(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Feuille Google : date sérialisée (nombre) ou chaîne (souvent JJ/MM/AAAA). */
export function parseSheetDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeCanonicalDateKey(serialToLocalYmd(value));
  }
  let s = String(value).replace(/\u00a0/g, " ").trim();
  s = s.replace(/\s+/g, " ");
  if (!s) return null;

  // JJ/MM/AAAA (espaces autour des / autorisés)
  let m = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    return normalizeCanonicalDateKey(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }

  // JJ-MM-AAAA ou JJ.MM.AAAA
  m = /^(\d{1,2})\s*[-.]\s*(\d{1,2})\s*[-.]\s*(\d{4})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    return normalizeCanonicalDateKey(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return normalizeCanonicalDateKey(s);

  // ISO avec heure
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return normalizeCanonicalDateKey(s.slice(0, 10));
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeCanonicalDateKey(formatLocalYmd(parsed));
  }
  return null;
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Jours depuis 1899-12-30 (comme Google Sheets / Excel) → date locale YYYY-MM-DD */
function serialToLocalYmd(serial: number): string {
  const whole = Math.floor(serial);
  const epochMs = (whole - 25569) * 86400 * 1000;
  const d = new Date(epochMs);
  return formatLocalYmd(d);
}

function cell(
  row: Array<string | number | boolean | null | undefined>,
  i: number
): string {
  const v = row[i];
  if (v === null || v === undefined) return "";
  return norm(String(v));
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const key = normalizeHeaderCell(c);
    const idx = headers.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

const HEADER_SCAN_MAX = 400;

/** Repère la ligne d’en-têtes (DATE / CLIENT / TYPE), même si elle n’est pas en ligne 1. */
function findHeaderRowIndex(
  rows: Array<Array<string | number | boolean | null | undefined>>
): number {
  const limit = Math.min(rows.length, HEADER_SCAN_MAX);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;
    const headers = row.map((h) =>
      normalizeHeaderCell(norm(String(h ?? "")))
    );
    const dateCol = findColumnIndex(headers, ["DATE", "date"]);
    const clientCol = findColumnIndex(headers, ["CLIENT", "client"]);
    const typeCol = findColumnIndex(headers, ["TYPE", "type"]);
    if (dateCol >= 0 && clientCol >= 0 && typeCol >= 0) {
      return i;
    }
  }
  return -1;
}

export type ParsedDailyServices = {
  rows: DailyServiceRow[];
  headerRowIndex: number;
  /** Index de la colonne DATE (A=0) pour debug */
  dateColumnIndex: number;
};

/**
 * Parse les lignes avec en-tête : DATE, CLIENT, TEL, TYPE, RDV 1, RDV 2, VOL, DEST/PROV
 */
export function parseDailyServiceRows(
  rows: Array<Array<string | number | boolean | null | undefined>>
): ParsedDailyServices {
  if (!rows.length) {
    return { rows: [], headerRowIndex: -1, dateColumnIndex: -1 };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    throw new Error(
      'Ligne d’en-têtes introuvable (cherchez les colonnes "DATE", "CLIENT", "TYPE").'
    );
  }

  const header = rows[headerRowIndex];
  const data = rows.slice(headerRowIndex + 1);

  const headers = header.map((h) =>
    normalizeHeaderCell(norm(String(h ?? "")))
  );

  const dateCol = findColumnIndex(headers, ["DATE", "date"]);
  const clientCol = findColumnIndex(headers, ["CLIENT", "client"]);
  const telCol = findColumnIndex(headers, ["TEL", "tel"]);
  const typeCol = findColumnIndex(headers, ["TYPE", "type"]);
  const rdv1Col = findColumnIndex(headers, ["RDV 1", "RDV1", "rdv 1", "rdv1"]);
  const rdv2Col = findColumnIndex(headers, ["RDV 2", "RDV2", "rdv 2", "rdv2"]);
  const volCol = findColumnIndex(headers, ["VOL", "vol"]);
  const destCol = findColumnIndex(headers, [
    "DEST/PROV",
    "DEST/prov",
    "dest/prov",
    "DEST PROV",
  ]);
  const driverInfoCol = findColumnIndex(headers, [
    "INFOS DRIVER",
    "infos driver",
    "DRIVER",
    "driver",
  ]);

  if (dateCol < 0 || clientCol < 0 || typeCol < 0) {
    throw new Error(
      'En-têtes requis : au minimum "DATE", "CLIENT" et "TYPE".'
    );
  }

  const out: DailyServiceRow[] = [];
  for (const row of data) {
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawDate = row[dateCol] as unknown;
    const dateIso = parseSheetDateCell(rawDate);
    if (!dateIso) continue;

    const client = cell(row, clientCol);
    const type = cell(row, typeCol);
    if (!client && !type) continue;

    out.push({
      dateIso: normalizeCanonicalDateKey(dateIso),
      client,
      tel: telCol >= 0 ? cell(row, telCol) : "",
      driverInfo: driverInfoCol >= 0 ? cell(row, driverInfoCol) : "",
      type,
      rdv1: rdv1Col >= 0 ? cell(row, rdv1Col) : "",
      rdv2: rdv2Col >= 0 ? cell(row, rdv2Col) : "",
      vol: volCol >= 0 ? cell(row, volCol) : "",
      destProv: destCol >= 0 ? cell(row, destCol) : "",
    });
  }
  return {
    rows: out,
    headerRowIndex,
    dateColumnIndex: dateCol,
  };
}
