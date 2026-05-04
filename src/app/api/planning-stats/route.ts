import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import {
  computePlanningScores,
  type PlanningStatsPeriod,
  planningStatsPeriodMeta,
  type StatsReportInput,
} from "@/lib/planning/planning-stats";
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

  const rows: StatsReportInput[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("service_reports")
      .select(
        "assignee_name, service_date, meeting_time, end_of_service, service_started_at, completed_at"
      )
      .eq("spreadsheet_id", spreadsheetId)
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
      rows.push({
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

  const scores = computePlanningScores(rows, meta.start, meta.end);

  return NextResponse.json({
    period: meta,
    spreadsheetId,
    rows: scores,
  });
}
