import { NextResponse } from "next/server";

import { fetchDailyServicesFromSheet } from "@/lib/google/fetch-daily-services";
import { resolveRequestUrl } from "@/lib/http/resolve-request-url";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serviceReportIdFromRow } from "@/lib/reports/service-report-id";

function resolveSpreadsheetId(request: Request): string | null {
  const url = resolveRequestUrl(request);
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

  const url = resolveRequestUrl(request);
  const dateParam = url.searchParams.get("date")?.trim();
  const filterDateIso = dateParam
    ? normalizeCanonicalDateKey(dateParam)
    : undefined;

  try {
    const { rows, debug } = await fetchDailyServicesFromSheet(spreadsheetId, {
      filterDateIso,
    });

    const assigneesByServiceId: Record<string, string> = {};
    const supabase = getSupabaseAdmin();
    if (supabase && rows.length > 0) {
      const serviceIds = [...new Set(rows.map(serviceReportIdFromRow).filter(Boolean))];
      if (serviceIds.length > 0) {
        const { data: assRows } = await supabase
          .from("planning_assignments")
          .select("service_id,agent_name")
          .in("service_id", serviceIds);

        for (const r of assRows ?? []) {
          const serviceId = (r as { service_id?: unknown }).service_id;
          const agentName = (r as { agent_name?: unknown }).agent_name;
          if (typeof serviceId !== "string") continue;
          if (typeof agentName !== "string" || !agentName.trim()) continue;
          assigneesByServiceId[serviceId] = agentName.trim();
        }
      }
    }

    return NextResponse.json({
      rows,
      assigneesByServiceId,
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
