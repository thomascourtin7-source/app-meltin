import { createSign } from "crypto";

import {
  normalizeCanonicalDateKey,
  parseDailyServiceRows,
  type DailyServiceRow,
} from "@/lib/planning/daily-services";

const SHEETS_VALUES_BASE =
  "https://sheets.googleapis.com/v4/spreadsheets";

export const PLANNING_READER_SERVICE_ACCOUNT_EMAIL =
  "planning-reader@planning-meltin.iam.gserviceaccount.com";

export const GOOGLE_SHEETS_PERMISSION_DENIED_MESSAGE =
  `Veuillez partager le Google Sheet avec ${PLANNING_READER_SERVICE_ACCOUNT_EMAIL}`;

export class GoogleSheetsPermissionDeniedError extends Error {
  readonly code = "GOOGLE_PERMISSION_DENIED";

  constructor(message = GOOGLE_SHEETS_PERMISSION_DENIED_MESSAGE) {
    super(message);
    this.name = "GoogleSheetsPermissionDeniedError";
  }
}

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

/**
 * Plage par défaut : onglet **Feuille 1** (vérifier dans Google Sheets que le nom correspond),
 * colonnes A–M jusqu’à la ligne 1000 (colonne « assigné » optionnelle).
 * Surcharge : PLANNING_SHEET_RANGE ou NEXT_PUBLIC_PLANNING_SHEET_RANGE
 */
function getSheetRange(): string {
  const fromEnv =
    process.env.PLANNING_SHEET_RANGE?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SHEET_RANGE?.trim();
  if (fromEnv) return fromEnv;
  return "'Feuille 1'!A1:M1000";
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

function readServiceAccountCredentials(): ServiceAccountCredentials | null {
  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() ||
    "";

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
    const clientEmail = parsed.client_email?.trim();
    const privateKey = parsed.private_key?.replace(/\\n/g, "\n").trim();
    if (!clientEmail || !privateKey) return null;
    return { client_email: clientEmail, private_key: privateKey };
  } catch {
    return null;
  }
}

function resolveServiceAccountEmail(
  credentials: ServiceAccountCredentials | null
): string | null {
  return (
    credentials?.client_email?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    null
  );
}

function base64UrlEncode(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signServiceAccountJwt(
  credentials: ServiceAccountCredentials
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(credentials.private_key);
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function getServiceAccountAccessToken(
  credentials: ServiceAccountCredentials
): Promise<string> {
  const assertion = signServiceAccountJwt(credentials);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    const msg =
      data.error_description ||
      data.error ||
      `Impossible d’obtenir un jeton Google (${res.status}).`;
    throw new Error(msg);
  }

  return data.access_token;
}

async function buildGoogleSheetsAuth(): Promise<{
  authorizationHeader: string | null;
  apiKey: string | null;
}> {
  const credentials = readServiceAccountCredentials();
  const clientEmail = resolveServiceAccountEmail(credentials);
  console.log("Utilisation du compte de service:", clientEmail);

  if (credentials) {
    const accessToken = await getServiceAccountAccessToken(credentials);
    return {
      authorizationHeader: `Bearer ${accessToken}`,
      apiKey: null,
    };
  }

  return {
    authorizationHeader: null,
    apiKey: getGoogleSheetsApiKey(),
  };
}

export type FetchDailyServicesOptions = {
  /** Si défini (YYYY-MM-DD), ne retourne que les lignes dont la DATE correspond. */
  filterDateIso?: string;
};

export async function fetchDailyServicesFromSheet(
  spreadsheetId: string,
  options?: FetchDailyServicesOptions
): Promise<DailyServicesFetchResult> {
  const range = getSheetRange();
  const pathRange = encodeURIComponent(range);
  const { authorizationHeader, apiKey } = await buildGoogleSheetsAuth();
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
