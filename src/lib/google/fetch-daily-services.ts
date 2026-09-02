import {
  normalizeCanonicalDateKey,
  parseDailyServiceRows,
  type DailyServiceRow,
} from "@/lib/planning/daily-services";

import { buildGoogleSheetsReadAuth } from "@/lib/google/sheets-auth";
import { getPlanningSheetRange } from "@/lib/google/sheets-config";

const SHEETS_VALUES_BASE =
  "https://sheets.googleapis.com/v4/spreadsheets";

export const GOOGLE_SHEETS_PERMISSION_DENIED_MESSAGE =
  "Accès Google Sheet refusé : partagez le fichier en lecture (« Toute personne disposant du lien ») et vérifiez GOOGLE_SHEETS_API_KEY.";

export class GoogleSheetsPermissionDeniedError extends Error {
  readonly code = "GOOGLE_PERMISSION_DENIED";

  constructor(message = GOOGLE_SHEETS_PERMISSION_DENIED_MESSAGE) {
    super(message);
    this.name = "GoogleSheetsPermissionDeniedError";
  }
}

export type DailyServicesFetchResult = {
  rows: DailyServiceRow[];
  rowsWithIndex: Array<{ row: DailyServiceRow; sheetRowIndex: number }>;
  assigneeColumnIndex: number;
  debug: {
    range: string;
    rawRowCount: number;
    rawFirstRows: Array<Array<string | number | boolean | null | undefined>>;
    headerRowIndex: number;
    dateColumnIndex: number;
    assigneeColumnIndex: number;
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

export type FetchDailyServicesOptions = {
  /** Si défini (YYYY-MM-DD), ne retourne que les lignes dont la DATE correspond. */
  filterDateIso?: string;
};

export async function fetchDailyServicesFromSheet(
  spreadsheetId: string,
  options?: FetchDailyServicesOptions
): Promise<DailyServicesFetchResult> {
  const range = getPlanningSheetRange();
  const pathRange = encodeURIComponent(range);
  const { authorizationHeader, apiKey } = await buildGoogleSheetsReadAuth();
  const url = authorizationHeader
    ? `${SHEETS_VALUES_BASE}/${encodeURIComponent(spreadsheetId)}/values/${pathRange}`
    : `${SHEETS_VALUES_BASE}/${encodeURIComponent(spreadsheetId)}/values/${pathRange}?key=${encodeURIComponent(apiKey ?? "")}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: authorizationHeader
      ? { Authorization: authorizationHeader }
      : undefined,
  });
  const data = (await res.json()) as SheetsValuesApiResponse;

  if (!res.ok) {
    if (res.status === 403) {
      throw new GoogleSheetsPermissionDeniedError();
    }

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
  let rowsWithIndex = parsed.rowsWithIndex;
  if (filterKey) {
    rowsWithIndex = parsed.rowsWithIndex.filter(
      ({ row }) => row.dateIso === filterKey
    );
    rows = rowsWithIndex.map(({ row }) => row);
  }

  const uniqueParsedDates = [
    ...new Set(parsed.rows.map((r) => r.dateIso)),
  ]
    .sort()
    .slice(0, 31);

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
    rowsWithIndex,
    assigneeColumnIndex: parsed.assigneeColumnIndex,
    debug: {
      range,
      rawRowCount: raw.length,
      rawFirstRows: raw.slice(0, 20),
      headerRowIndex: parsed.headerRowIndex,
      dateColumnIndex: parsed.dateColumnIndex,
      assigneeColumnIndex: parsed.assigneeColumnIndex,
      uniqueParsedDates,
      rawDateCellSamples,
    },
  };
}
