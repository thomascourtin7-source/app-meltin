import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";
import { fetchDailyServicesFromSheet } from "@/lib/google/fetch-daily-services";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import {
  computePlanningScores,
  type PlanningStatsPeriod,
  planningStatsPeriodMeta,
  type StatsReportInput,
} from "@/lib/planning/planning-stats";
import { resolveSpreadsheetIdForDate } from "@/lib/planning/planning-sources";
import {
  PLANNING_URGENT_ASSIGNEE_DISPLAY,
  PLANNING_URGENT_ASSIGNEE_SLUG,
} from "@/lib/planning/planning-team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Premier agent réel d'un `agent_name` (« A;B », 🚨 ignoré). */
function firstRealAgentName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const part of String(raw).split(/[;|,+/]/)) {
    const t = part.trim();
    if (!t) continue;
    if (t === PLANNING_URGENT_ASSIGNEE_DISPLAY || t === PLANNING_URGENT_ASSIGNEE_SLUG) {
      continue;
    }
    return t;
  }
  return null;
}

const PAGE_SIZE = 1000;

function isPeriod(v: string | null): v is PlanningStatsPeriod {
  return (
    v === "current_month" || v === "last_month" || v === "total"
  );
}

export async function GET(request: Request) {
  const admin = await requirePlanningAdminBearer(request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const periodRaw = url.searchParams.get("period")?.trim() ?? "current_month";
  const period: PlanningStatsPeriod = isPeriod(periodRaw)
    ? periodRaw
    : "current_month";

  const spreadsheetId =
    url.searchParams.get("spreadsheetId")?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    DEFAULT_PLANNING_SPREADSHEET_ID;

  const meta = planningStatsPeriodMeta(period);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  // Le classeur du mois est résolu côté serveur (planning_sources), comme le
  // planning : les rapports/missions sont stockés sous CET id, pas sous l'id
  // par défaut/périmé du client → sinon la requête ne trouve rien (0 partout).
  const anchorDateForSource = period === "last_month" ? meta.start : meta.end;
  let resolvedSpreadsheetId = spreadsheetId;
  try {
    resolvedSpreadsheetId = await resolveSpreadsheetIdForDate(
      supabase,
      anchorDateForSource
    );
  } catch {
    resolvedSpreadsheetId = spreadsheetId;
  }

  type ReportRow = StatsReportInput & { service_id: string };
  const reportRows: ReportRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("service_reports")
      .select(
        "service_id, assignee_name, service_date, meeting_time, end_of_service, service_started_at, completed_at"
      )
      .eq("spreadsheet_id", resolvedSpreadsheetId)
      .gte("service_date", meta.start)
      .lte("service_date", meta.end)
      .not("completed_at", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const chunk = data ?? [];
    for (const r of chunk) {
      const o = r as Record<string, unknown>;
      reportRows.push({
        service_id: typeof o.service_id === "string" ? o.service_id : "",
        assignee_name:
          typeof o.assignee_name === "string" ? o.assignee_name : null,
        service_date:
          typeof o.service_date === "string"
            ? o.service_date.slice(0, 10)
            : String(o.service_date ?? "").slice(0, 10),
        meeting_time:
          typeof o.meeting_time === "string" ? o.meeting_time : null,
        end_of_service:
          typeof o.end_of_service === "string" ? o.end_of_service : null,
        service_started_at:
          typeof o.service_started_at === "string"
            ? o.service_started_at
            : null,
      });
    }

    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 200_000) break;
  }

  // Repli : rapport complété sans `assignee_name` → on récupère l'agent assigné
  // dans `planning_assignments` (source réelle des attributions).
  const missingAgentIds = [
    ...new Set(
      reportRows
        .filter((r) => !firstRealAgentName(r.assignee_name) && r.service_id)
        .map((r) => r.service_id)
    ),
  ];
  if (missingAgentIds.length > 0) {
    const agentByServiceId = new Map<string, string>();
    for (let i = 0; i < missingAgentIds.length; i += PAGE_SIZE) {
      const ids = missingAgentIds.slice(i, i + PAGE_SIZE);
      const { data: assignRows } = await supabase
        .from("planning_assignments")
        .select("service_id, agent_name")
        .in("service_id", ids);
      for (const a of assignRows ?? []) {
        const o = a as { service_id?: unknown; agent_name?: unknown };
        const sid = typeof o.service_id === "string" ? o.service_id : "";
        const agent = firstRealAgentName(
          typeof o.agent_name === "string" ? o.agent_name : null
        );
        if (sid && agent) agentByServiceId.set(sid, agent);
      }
    }
    for (const r of reportRows) {
      if (!firstRealAgentName(r.assignee_name)) {
        const fromAssign = agentByServiceId.get(r.service_id);
        if (fromAssign) r.assignee_name = fromAssign;
      }
    }
  }

  const rows: StatsReportInput[] = reportRows.map((r) => ({
    assignee_name: r.assignee_name,
    service_date: r.service_date,
    meeting_time: r.meeting_time,
    end_of_service: r.end_of_service,
    service_started_at: r.service_started_at,
  }));

  const scores = computePlanningScores(rows, meta.start, meta.end);

  // Total missions de la période : TOUTES les lignes valides du Google Sheet
  // (assignées, non assignées ou sous-traitées), sans exception.
  let totalMissions = 0;
  try {
    const { rows: sheetRows } = await fetchDailyServicesFromSheet(
      resolvedSpreadsheetId
    );
    totalMissions = sheetRows.filter(
      (r) => r.dateIso >= meta.start && r.dateIso <= meta.end
    ).length;
  } catch {
    totalMissions = 0;
  }

  return NextResponse.json({
    period: meta,
    spreadsheetId: resolvedSpreadsheetId,
    rows: scores,
    totalMissions,
  });
}
