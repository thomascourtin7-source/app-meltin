import {
  normalizeCanonicalDateKey,
  parseDailyServiceRows,
  type DailyServiceRow,
} from "@/lib/planning/daily-services";

const SHEETS_VALUES_BASE =
  "https://sheets.googleapis.com/v4/spreadsheets";

/**
 * Plage par défaut : onglet **Feuille 1** (vérifier dans Google Sheets que le nom correspond),
 * colonnes A–K jusqu’à la ligne 1000 (données ex. ligne 508 incluses).
 * Surcharge : PLANNING_SHEET_RANGE ou NEXT_PUBLIC_PLANNING_SHEET_RANGE
 */
function getSheetRange(): string {
  const fromEnv =
    process.env.PLANNING_SHEET_RANGE?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SHEET_RANGE?.trim();
  if (fromEnv) return fromEnv;
  return "'Feuille 1'!A1:K1000";
}

export type DailyServicesFetchResult = {
  rows: DailyServiceRow[];
  debug: {
    range: string;
    rawRowCount: number;
    rawFirstRows: Array<Array<string | number | boolean | null | undefined>>;
    headerRowIndex: number;
    dateColumnIndex: number;
    /** Jusqu’à 20 dates distinctes après parsing (YYYY-MM-DD) */
    uniqueParsedDates: string[];
    /** Premières valeurs DATE brutes (colonne date, lignes données) */
    rawDateCellSamples: unknown[];
  };
};

type SheetsValuesApiResponse = {
  range?: string;
  majorDimension?: string;
  values?: Array<Array<string | number | boolean | null | undefined>>;
  error?: { code?: number; message?: string; status?: string };
};

function getGoogleSheetsApiKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Variable NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY manquante."
    );
  }
  return key;
}

export type FetchDailyServicesOptions = {
  /** Si défini (YYYY-MM-DD), ne retourne que les lignes dont la DATE correspond. */
  filterDateIso?: string;
};

export async function fetchDailyServicesFromSheet(
  spreadsheetId: string,
  options?: FetchDailyServicesOptions
): Promise<DailyServicesFetchResult> {
  const apiKey = getGoogleSheetsApiKey();
  const range = getSheetRange();
  const pathRange = encodeURIComponent(range);
  const url =
    `${SHEETS_VALUES_BASE}/${encodeURIComponent(spreadsheetId)}/values/${pathRange}?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as SheetsValuesApiResponse;

  if (!res.ok) {
    const msg =
      data.error?.message ??
      (typeof data === "object" && data && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : res.statusText);
    throw new Error(
      `Google Sheets API (${res.status}) : ${msg || "Erreur inconnue."}`
    );
  }

  const raw = data.values ?? [];
  const parsed = parseDailyServiceRows(raw);

  const filterKey = options?.filterDateIso?.trim()
    ? normalizeCanonicalDateKey(options.filterDateIso)
    : "";

  let rows: DailyServiceRow[] = parsed.rows;
  if (filterKey) {
    rows = parsed.rows.filter((r) => r.dateIso === filterKey);
  }

  const uniqueParsedDates = [...new Set(rows.map((r) => r.dateIso))].slice(
    0,
    20
  );

  const rawDateCellSamples: unknown[] = [];
  const dc = parsed.dateColumnIndex;
  if (parsed.headerRowIndex >= 0 && dc >= 0) {
    for (
      let r = parsed.headerRowIndex + 1;
      r < Math.min(raw.length, parsed.headerRowIndex + 1 + 25);
      r++
    ) {
      const row = raw[r];
      if (row && row[dc] !== undefined) {
        rawDateCellSamples.push(row[dc]);
      }
    }
  }

  return {
    rows,
    debug: {
      range,
      rawRowCount: raw.length,
      rawFirstRows: raw.slice(0, 20),
      headerRowIndex: parsed.headerRowIndex,
      dateColumnIndex: parsed.dateColumnIndex,
      uniqueParsedDates,
      rawDateCellSamples,
    },
  };
}
