import { NextResponse } from "next/server";

import { reconcileAssignmentsByCanonicalId } from "@/lib/planning/planning-batch-reconcile";
import {
  parsePlanningRowPayloads,
  parseServiceDateParam,
} from "@/lib/planning/planning-row-payload";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const serviceIdsRaw = b.serviceIds;
  const serviceIds = Array.isArray(serviceIdsRaw)
    ? [
        ...new Set(
          serviceIdsRaw
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        ),
      ]
    : [];

  const serviceDate = parseServiceDateParam(b.serviceDate);
  const rows = parsePlanningRowPayloads(b.rows);
  const spreadsheetId =
    typeof b.spreadsheetId === "string" ? b.spreadsheetId.trim() : "";

  if (serviceDate && rows.length > 0) {
    const { data: assignments, error: assignError } = await supabase
      .from("planning_assignments")
      .select("service_id,agent_name,eta_time,updated_at")
      .eq("service_date", serviceDate);

    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    let reports: Array<{
      service_id: string;
      service_date?: string | null;
      service_client?: string | null;
      service_vol?: string | null;
      service_rdv1?: string | null;
      service_rdv2?: string | null;
    }> = [];

    if (spreadsheetId) {
      const { data: reportRows, error: reportError } = await supabase
        .from("service_reports")
        .select(
          "service_id,service_date,service_client,service_vol,service_rdv1,service_rdv2"
        )
        .eq("spreadsheet_id", spreadsheetId)
        .eq("service_date", serviceDate);

      if (reportError) {
        return NextResponse.json({ error: reportError.message }, { status: 500 });
      }
      reports = (reportRows ?? []) as typeof reports;
    }

    const reconciled = reconcileAssignmentsByCanonicalId(
      rows,
      (assignments ?? []) as Array<{
        service_id: string;
        agent_name?: string | null;
        eta_time?: string | null;
        updated_at?: string | null;
      }>,
      reports
    );

    return NextResponse.json(reconciled);
  }

  if (serviceIds.length === 0) {
    return NextResponse.json({ assigneesByServiceId: {}, etaTimeByServiceId: {} });
  }

  const { data, error } = await supabase
    .from("planning_assignments")
    .select("service_id,agent_name,eta_time")
    .in("service_id", serviceIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assigneesByServiceId: Record<string, string> = {};
  const etaTimeByServiceId: Record<string, string | null> = {};
  for (const id of serviceIds) {
    etaTimeByServiceId[id] = null;
  }
  for (const r of data ?? []) {
    const serviceId = (r as { service_id?: unknown }).service_id;
    const agentName = (r as { agent_name?: unknown }).agent_name;
    const etaRaw = (r as { eta_time?: unknown }).eta_time;
    if (typeof serviceId !== "string") continue;
    if (typeof agentName === "string" && agentName.trim()) {
      assigneesByServiceId[serviceId] = agentName.trim();
    }
    etaTimeByServiceId[serviceId] =
      typeof etaRaw === "string" && /^\d{2}:\d{2}$/.test(etaRaw.trim())
        ? etaRaw.trim()
        : null;
  }

  return NextResponse.json({ assigneesByServiceId, etaTimeByServiceId });
}
