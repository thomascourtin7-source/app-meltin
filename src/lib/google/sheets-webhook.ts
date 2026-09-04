import {
  buildSheetCellRange,
  columnIndexToA1Letter,
} from "@/lib/google/sheets-config";

const SHEETS_VALUES_BASE =
  "https://sheets.googleapis.com/v4/spreadsheets";

export type SheetAssigneeWritePayload = {
  spreadsheetId: string;
  tabName: string;
  /** Index de colonne 0-based (A = 0). */
  columnIndex: number;
  /** Numéro de ligne Sheet 1-based. */
  rowNumber: number;
  value: string;
};

export type SheetAssigneeWriteResult = {
  ok: true;
  method: "webhook" | "api_key";
  updatedRange: string;
};

function readSheetsApiKey(): string | null {
  return (
    process.env.GOOGLE_SHEETS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY?.trim() ||
    null
  );
}

function readWebhookConfig(): { url: string; secret: string } | null {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}

async function writeViaAppsScriptWebhook(
  payload: SheetAssigneeWritePayload,
  config: { url: string; secret: string }
): Promise<SheetAssigneeWriteResult> {
  const columnNumber = payload.columnIndex + 1;
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: config.secret,
      spreadsheetId: payload.spreadsheetId,
      tabName: payload.tabName,
      rowNumber: payload.rowNumber,
      columnNumber,
      value: payload.value ?? "",
    }),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await res.text();
  let data: { ok?: boolean; error?: string; updatedRange?: string } = {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(
      `Réponse webhook Apps Script invalide (${res.status}).`
    );
  }

  if (!res.ok || !data.ok) {
    throw new Error(
      data.error ||
        `Webhook Apps Script (${res.status}) : ${text.slice(0, 200)}`
    );
  }

  const updatedRange =
    data.updatedRange ??
    buildSheetCellRange(
      payload.tabName,
      payload.columnIndex,
      payload.rowNumber
    );

  return { ok: true, method: "webhook", updatedRange };
}

async function writeViaApiKey(
  payload: SheetAssigneeWritePayload,
  apiKey: string
): Promise<SheetAssigneeWriteResult> {
  const range = buildSheetCellRange(
    payload.tabName,
    payload.columnIndex,
    payload.rowNumber
  );
  const pathRange = encodeURIComponent(range);
  const url = `${SHEETS_VALUES_BASE}/${encodeURIComponent(payload.spreadsheetId)}/values/${pathRange}?valueInputOption=USER_ENTERED&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [[payload.value]] }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    updatedRange?: string;
  };

  if (!res.ok) {
    const msg = data.error?.message || `Google Sheets API (${res.status})`;
    throw new Error(
      `${msg} — l'écriture par clé API ne fonctionne que si le Sheet est accessible en édition publique. Préférez GOOGLE_SHEETS_WEBHOOK_URL (Apps Script).`
    );
  }

  return {
    ok: true,
    method: "api_key",
    updatedRange: data.updatedRange ?? range,
  };
}

/**
 * Écrit la cellule Agent : webhook Apps Script (recommandé) puis repli clé API.
 */
export async function writeSheetAssigneeCell(
  payload: SheetAssigneeWritePayload
): Promise<SheetAssigneeWriteResult> {
  const webhook = readWebhookConfig();
  if (webhook) {
    return writeViaAppsScriptWebhook(payload, webhook);
  }

  const apiKey = readSheetsApiKey();
  if (apiKey) {
    return writeViaApiKey(payload, apiKey);
  }

  throw new Error(
    "Écriture Sheet impossible : configurez GOOGLE_SHEETS_WEBHOOK_URL + GOOGLE_SHEETS_WEBHOOK_SECRET (Apps Script), ou une clé API Google Sheets pour un Sheet public en édition."
  );
}

/** Pour les logs / réponses API. */
export function describeSheetWriteColumn(columnIndex: number): string {
  return columnIndexToA1Letter(columnIndex);
}
