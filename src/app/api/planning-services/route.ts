import { NextResponse } from "next/server";

import { fetchDailyServicesFromSheet, GoogleSheetsPermissionDeniedError } from "@/lib/google/fetch-daily-services";
import { resolveRequestUrl } from "@/lib/http/resolve-request-url";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  PLANNING_SOURCE_MISSING_ERROR,
  readEnvPlanningSpreadsheetId,
  resolveSpreadsheetIdForDate,
  resolveSpreadsheetIdsForGlobalImport,
  todayIsoParis,
} from "@/lib/planning/planning-sources";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const url = resolveRequestUrl(request);
    const dateParam = url.searchParams.get("date")?.trim();
    const filterDateIso = dateParam
      ? normalizeCanonicalDateKey(dateParam)
      : undefined;
    const anchorDateIso = filterDateIso ?? todayIsoParis();
    const date = anchorDateIso;

    console.log("--- REQUÊTE REÇUE ---", {
      date,
      spreadsheetIdEnv: process.env.GOOGLE_SPREADSHEET_ID,
    });

    const envSpreadsheetId = readEnvPlanningSpreadsheetId();
    const globalImport = url.searchParams.get("scope") === "global";
    const supabase = getSupabaseAdmin();

    if (globalImport) {
      let spreadsheetIds: string[] = [];

      if (supabase) {
        try {
          const resolved = await resolveSpreadsheetIdsForGlobalImport(
            supabase,
            anchorDateIso
          );
          spreadsheetIds = resolved.spreadsheetIds;
        } catch {
          spreadsheetIds = [];
        }
      }

      if (spreadsheetIds.length === 0 && envSpreadsheetId) {
        spreadsheetIds = [envSpreadsheetId];
      }

      if (spreadsheetIds.length === 0) {
        return NextResponse.json(
          { error: PLANNING_SOURCE_MISSING_ERROR },
          { status: 404 }
        );
      }

      const rowsByKey = new Map<string, DailyServiceRow>();
      for (const spreadsheetId of spreadsheetIds) {
        const finalSpreadsheetId = spreadsheetId;
        console.log("TENTATIVE LECTURE GOOGLE:", finalSpreadsheetId);
        const { rows } = await fetchDailyServicesFromSheet(finalSpreadsheetId);
        for (const row of rows) {
          rowsByKey.set(
            `${row.dateIso}\u0001${row.client}\u0001${row.vol}`,
            row
          );
        }
      }

      const rows = [...rowsByKey.values()].sort((a, b) => {
        const d = a.dateIso.localeCompare(b.dateIso);
        if (d !== 0) return d;
        return a.rdv1.localeCompare(b.rdv1);
      });

      return NextResponse.json({
        rows,
        fetchedAt: new Date().toISOString(),
        spreadsheetId: spreadsheetIds[0] ?? null,
        spreadsheetIds,
        filterDateIso: filterDateIso ?? null,
      });
    }

    let finalSpreadsheetId = envSpreadsheetId;

    if (supabase) {
      try {
        finalSpreadsheetId = await resolveSpreadsheetIdForDate(
          supabase,
          anchorDateIso
        );
      } catch {
        finalSpreadsheetId = envSpreadsheetId;
      }
    }

    if (!finalSpreadsheetId) {
      return NextResponse.json(
        { error: PLANNING_SOURCE_MISSING_ERROR },
        { status: 404 }
      );
    }

    console.log("TENTATIVE LECTURE GOOGLE:", finalSpreadsheetId);
    const { rows, debug } = await fetchDailyServicesFromSheet(finalSpreadsheetId, {
      filterDateIso,
    });

    return NextResponse.json({
      rows,
      fetchedAt: new Date().toISOString(),
      spreadsheetId: finalSpreadsheetId,
      filterDateIso: filterDateIso ?? null,
      debug,
    });
  } catch (error) {
    if (error instanceof GoogleSheetsPermissionDeniedError) {
      return NextResponse.json(
        {
          error: "GOOGLE_PERMISSION_DENIED",
          message: error.message,
        },
        { status: 403 }
      );
    }

    console.error("CRASH API:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
