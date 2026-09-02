import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { rowMatchesStoredIdentityKey } from "@/lib/planning/service-row-keys";

import { fetchDailyServicesFromSheet } from "@/lib/google/fetch-daily-services";
import {
  getPlanningSheetRange,
  parseSheetTabName,
  readGoogleSpreadsheetId,
} from "@/lib/google/sheets-config";
import { writeSheetAssigneeCell } from "@/lib/google/sheets-webhook";

export type SyncSheetAssigneeOpts = {
  spreadsheetId?: string;
  serviceId: string;
  lookupIds?: string[];
  serviceDate: string;
  /** Libellés agents (`Thomas;Karthik`) ou `null` pour vider la cellule. */
  assigneeLabel: string | null;
};

export type SyncSheetAssigneeResult =
  | {
      ok: true;
      updatedRange: string;
      sheetRowNumber: number;
      writeMethod: "webhook" | "api_key";
    }
  | { ok: false; skipped?: boolean; reason: string };

function norm(value: string): string {
  return value.trim();
}

function matchesServiceInSheet(
  row: DailyServiceRow,
  serviceId: string,
  lookupIds: string[]
): boolean {
  const nativeId = norm(row.sheetId);
  const sid = norm(serviceId);
  if (nativeId && sid && nativeId === sid) return true;
  if (sid && nativeId && nativeId.toLowerCase() === sid.toLowerCase()) {
    return true;
  }

  const keys = new Set(
    [serviceId, ...lookupIds].map((k) => k.trim()).filter(Boolean)
  );
  for (const key of keys) {
    if (rowMatchesStoredIdentityKey(row, key)) return true;
  }
  return false;
}

/**
 * Met à jour la colonne Agent/Assigné du Google Sheet pour une mission.
 * Écriture via webhook Apps Script (recommandé) ou clé API (Sheet public).
 */
export async function syncSheetAssigneeForService(
  opts: SyncSheetAssigneeOpts
): Promise<SyncSheetAssigneeResult> {
  const spreadsheetId =
    opts.spreadsheetId?.trim() || readGoogleSpreadsheetId() || "";
  const serviceId = opts.serviceId.trim();
  const serviceDate = normalizeCanonicalDateKey(opts.serviceDate).slice(0, 10);
  const lookupIds = (opts.lookupIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);

  if (!spreadsheetId) {
    return {
      ok: false,
      skipped: true,
      reason: "GOOGLE_SHEET_ID (ou PLANNING_SPREADSHEET_ID) manquant.",
    };
  }
  if (!serviceId || !serviceDate) {
    return { ok: false, reason: "serviceId ou serviceDate manquant." };
  }

  const { rowsWithIndex, assigneeColumnIndex } =
    await fetchDailyServicesFromSheet(spreadsheetId, {
      filterDateIso: serviceDate,
    });

  if (assigneeColumnIndex < 0) {
    return {
      ok: false,
      reason:
        'Colonne Agent introuvable (en-têtes « AGENT », « ASSIGNÉ », « CHAUFFEUR », etc.).',
    };
  }

  const match = rowsWithIndex.find(({ row }) =>
    matchesServiceInSheet(row, serviceId, lookupIds)
  );

  if (!match) {
    return {
      ok: false,
      reason: "Ligne service introuvable dans le Google Sheet.",
    };
  }

  const tabName = parseSheetTabName(getPlanningSheetRange());
  const sheetRowNumber = match.sheetRowIndex + 1;
  const cellValue = (opts.assigneeLabel ?? "").trim();

  const writeResult = await writeSheetAssigneeCell({
    spreadsheetId,
    tabName,
    columnIndex: assigneeColumnIndex,
    rowNumber: sheetRowNumber,
    value: cellValue,
  });

  return {
    ok: true,
    updatedRange: writeResult.updatedRange,
    sheetRowNumber,
    writeMethod: writeResult.method,
  };
}
