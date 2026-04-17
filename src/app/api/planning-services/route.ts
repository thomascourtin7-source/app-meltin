import { NextResponse } from "next/server";

import { fetchDailyServicesFromSheet } from "@/lib/google/fetch-daily-services";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";

function resolveSpreadsheetId(request: Request): string | null {
  const url = new URL(request.url);
  const q = url.searchParams.get("spreadsheetId")?.trim();
  if (q) return q;
  const env =
    process.env.PLANNING_SPREADSHEET_ID?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim();
  if (env) return env;
  return DEFAULT_PLANNING_SPREADSHEET_ID;
}

export async function GET(request: Request) {
  const spreadsheetId = resolveSpreadsheetId(request);
  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "Identifiant de spreadsheet manquant." },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date")?.trim();
  const filterDateIso = dateParam
    ? normalizeCanonicalDateKey(dateParam)
    : undefined;

  try {
    const { rows, debug } = await fetchDailyServicesFromSheet(spreadsheetId, {
      filterDateIso,
    });

    return NextResponse.json({
      rows,
      fetchedAt: new Date().toISOString(),
      spreadsheetId,
      filterDateIso: filterDateIso ?? null,
      debug,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Google Sheets.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
