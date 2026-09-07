import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";
import { fetchDailyServicesFromSheet } from "@/lib/google/fetch-daily-services";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import {
  computePlanningScores,
  isStatsCountableReport,
  mergeStoredAssigneeNames,
  type PlanningStatsPeriod,
  planningStatsPeriodMeta,
  type StatsReportInput,
} from "@/lib/planning/planning-stats";
import { resolveSpreadsheetIdForDate } from "@/lib/planning/planning-sources";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  const reportByKey = new Map<string, ReportRow>();

  const ingestReportChunk = (chunk: unknown[]) => {
    for (const r of chunk) {
      const o = r as Record<string, unknown>;
      const completedAt =
        typeof o.completed_at === "string"
          ? o.completed_at
          : o.completed_at != null
            ? String(o.completed_at)
            : null;
      const noShow = o.no_show;
      if (
        !isStatsCountableReport({
          completed_at: completedAt,
          no_show:
            typeof noShow === "boolean" || typeof noShow === "string"
              ? noShow
              : null,
        })
      ) {
        continue;
      }
      const serviceId = typeof o.service_id === "string" ? o.service_id : "";
      const serviceDate =
        typeof o.service_date === "string"
          ? o.service_date.slice(0, 10)
          : String(o.service_date ?? "").slice(0, 10);
      const key = serviceId || `${serviceDate}:${o.assignee_name ?? ""}`;
      if (reportByKey.has(key)) continue;
      reportByKey.set(key, {
        service_id: serviceId,
        assignee_name:
          typeof o.assignee_name === "string" ? o.assignee_name : null,
        service_date: serviceDate,
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
  };

  const REPORT_COLUMNS =
    "service_id, assignee_name, service_date, meeting_time, end_of_service, service_started_at, completed_at, no_show";

  const paginateFilteredReports = async (mode: "or" | "completed" | "no_show") => {
    let from = 0;
    for (;;) {
      let query = supabase
        .from("service_reports")
        .select(REPORT_COLUMNS)
        .eq("spreadsheet_id", resolvedSpreadsheetId)
        .gte("service_date", meta.start)
        .lte("service_date", meta.end);
      if (mode === "or") {
        query = query.or("completed_at.not.is.null,no_show.eq.true");
      } else if (mode === "completed") {
        query = query.not("completed_at", "is", null);
      } else {
        query = query.eq("no_show", true);
      }
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) return error.message;
      const chunk = data ?? [];
      ingestReportChunk(chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      if (from > 200_000) break;
    }
    return null;
  };

  const orError = await paginateFilteredReports("or");
  if (orError) {
    reportByKey.clear();
    const completedError = await paginateFilteredReports("completed");
    if (completedError) {
      return NextResponse.json({ error: completedError }, { status: 500 });
    }
    const noShowError = await paginateFilteredReports("no_show");
    if (noShowError) {
      console.warn("[planning-stats] no_show fallback", noShowError);
    }
  }

  const reportRows = [...reportByKey.values()];

  // Tous les agents de `planning_assignments` (co-assignations « Deva;Thomas »),
  // pas seulement le premier nom, ni seulement les rapports sans assignee_name.
  const assignmentNameByServiceId = new Map<string, string | null>();
  const mergeAssignment = (sid: string, agentName: string | null) => {
    if (!sid) return;
    assignmentNameByServiceId.set(
      sid,
      mergeStoredAssigneeNames(assignmentNameByServiceId.get(sid), agentName)
    );
  };

  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("planning_assignments")
      .select("service_id, agent_name")
      .gte("service_date", meta.start)
      .lte("service_date", meta.end)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn("[planning-stats] planning_assignments période", error.message);
      break;
    }
    const chunk = data ?? [];
    for (const a of chunk) {
      const o = a as { service_id?: unknown; agent_name?: unknown };
      const sid = typeof o.service_id === "string" ? o.service_id.trim() : "";
      const agent = typeof o.agent_name === "string" ? o.agent_name : null;
      mergeAssignment(sid, agent);
    }
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 200_000) break;
  }

  const reportServiceIds = [
    ...new Set(reportRows.map((r) => r.service_id).filter(Boolean)),
  ];
  for (let i = 0; i < reportServiceIds.length; i += PAGE_SIZE) {
    const ids = reportServiceIds.slice(i, i + PAGE_SIZE);
    const { data: assignRows } = await supabase
      .from("planning_assignments")
      .select("service_id, agent_name")
      .in("service_id", ids);
    for (const a of assignRows ?? []) {
      const o = a as { service_id?: unknown; agent_name?: unknown };
      const sid = typeof o.service_id === "string" ? o.service_id.trim() : "";
      const agent = typeof o.agent_name === "string" ? o.agent_name : null;
      mergeAssignment(sid, agent);
    }
  }

  for (const r of reportRows) {
    r.assignee_name = mergeStoredAssigneeNames(
      r.assignee_name,
      assignmentNameByServiceId.get(r.service_id)
    );
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
