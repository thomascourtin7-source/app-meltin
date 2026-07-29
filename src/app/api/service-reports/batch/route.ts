import { NextResponse } from "next/server";

import {
  pecStatusFromStored,
  pecStatusToIsPec,
  type PecStatus,
} from "@/lib/planning/pec-status";
import { resolveStoredServiceIdForPlanningRow } from "@/lib/planning/planning-batch-reconcile";
import {
  parsePlanningRowPayloads,
  parseServiceDateParam,
} from "@/lib/planning/planning-row-payload";
import { serviceReportIdFromRow } from "@/lib/reports/service-report-id";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ReportDbRow = {
  service_id: string;
  service_date?: string | null;
  service_client?: string | null;
  service_vol?: string | null;
  service_rdv1?: string | null;
  service_rdv2?: string | null;
  is_pec?: boolean | null;
  pec_status?: string | null;
  completed_at?: string | null;
  photo_url?: string | null;
};

function applyReportFlags(
  targetId: string,
  row: ReportDbRow,
  existing: Set<string>,
  isPecByServiceId: Record<string, boolean>,
  pecStatusByServiceId: Record<string, PecStatus>,
  isCompletedByServiceId: Record<string, boolean>,
  hasPhotoByServiceId: Record<string, boolean>,
  photoUrlByServiceId: Record<string, string | null>
): void {
  existing.add(targetId);
  const pecStatus = pecStatusFromStored(row);
  pecStatusByServiceId[targetId] = pecStatus;
  isPecByServiceId[targetId] = pecStatusToIsPec(pecStatus);
  const completedAt = row.completed_at;
  if (typeof completedAt === "string" && completedAt.trim()) {
    isCompletedByServiceId[targetId] = true;
  }
  const photoUrl = row.photo_url;
  if (typeof photoUrl === "string" && photoUrl.trim()) {
    hasPhotoByServiceId[targetId] = true;
    photoUrlByServiceId[targetId] = photoUrl.trim();
  }
}

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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const spreadsheetId =
    typeof b.spreadsheetId === "string" ? b.spreadsheetId.trim() : "";
  const serviceDate = parseServiceDateParam(b.serviceDate);
  const rows = parsePlanningRowPayloads(b.rows);
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

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "Champs requis manquants (spreadsheetId)." },
      { status: 400 }
    );
  }

  const canonicalIds =
    rows.length > 0
      ? [
          ...new Set(
            rows
              .map((row) => serviceReportIdFromRow(row))
              .filter(Boolean)
          ),
        ]
      : serviceIds;

  if (canonicalIds.length === 0) {
    return NextResponse.json(
      { error: "Champs requis manquants (serviceIds[] ou rows[])." },
      { status: 400 }
    );
  }

  let dbReports: ReportDbRow[] = [];
  let dbAssignments: Array<{ service_id: string; agent_name?: string | null }> =
    [];

  if (serviceDate && rows.length > 0) {
    const [reportsRes, assignRes] = await Promise.all([
      supabase
        .from("service_reports")
        .select(
          "service_id,service_date,service_client,service_vol,service_rdv1,service_rdv2,is_pec,pec_status,completed_at,photo_url"
        )
        .eq("spreadsheet_id", spreadsheetId)
        .eq("service_date", serviceDate),
      supabase
        .from("planning_assignments")
        .select("service_id,agent_name")
        .eq("service_date", serviceDate),
    ]);

    if (reportsRes.error) {
      return NextResponse.json({ error: reportsRes.error.message }, { status: 500 });
    }
    if (assignRes.error) {
      return NextResponse.json({ error: assignRes.error.message }, { status: 500 });
    }
    dbReports = (reportsRes.data ?? []) as ReportDbRow[];
    dbAssignments = (assignRes.data ?? []) as typeof dbAssignments;
  } else {
    const { data, error } = await supabase
      .from("service_reports")
      .select(
        "service_id,service_date,service_client,service_vol,service_rdv1,service_rdv2,is_pec,pec_status,completed_at,photo_url"
      )
      .eq("spreadsheet_id", spreadsheetId)
      .in("service_id", serviceIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    dbReports = (data ?? []) as ReportDbRow[];
  }

  const existing = new Set<string>();
  const isPecByServiceId: Record<string, boolean> = {};
  const pecStatusByServiceId: Record<string, PecStatus> = {};
  const isCompletedByServiceId: Record<string, boolean> = {};
  const hasPhotoByServiceId: Record<string, boolean> = {};
  const photoUrlByServiceId: Record<string, string | null> = {};

  for (const id of canonicalIds) {
    isPecByServiceId[id] = false;
    pecStatusByServiceId[id] = "vide";
    isCompletedByServiceId[id] = false;
    hasPhotoByServiceId[id] = false;
    photoUrlByServiceId[id] = null;
  }

  if (serviceDate && rows.length > 0) {
    const storedIds = new Set(
      [
        ...dbReports.map((r) => r.service_id.trim()),
        ...dbAssignments.map((a) => a.service_id.trim()),
      ].filter(Boolean)
    );

    for (const row of rows) {
      const canonical = serviceReportIdFromRow(row);
      if (!canonical) continue;
      const storedId = resolveStoredServiceIdForPlanningRow(
        row,
        storedIds,
        dbReports,
        rows,
        dbAssignments
      );
      if (!storedId) continue;
      const report = dbReports.find((r) => r.service_id.trim() === storedId);
      if (!report) continue;
      applyReportFlags(
        canonical,
        report,
        existing,
        isPecByServiceId,
        pecStatusByServiceId,
        isCompletedByServiceId,
        hasPhotoByServiceId,
        photoUrlByServiceId
      );
    }
  } else {
    for (const row of dbReports) {
      const sid = row.service_id?.trim();
      if (!sid || !canonicalIds.includes(sid)) continue;
      applyReportFlags(
        sid,
        row,
        existing,
        isPecByServiceId,
        pecStatusByServiceId,
        isCompletedByServiceId,
        hasPhotoByServiceId,
        photoUrlByServiceId
      );
    }
  }

  const hasReport: Record<string, boolean> = {};
  for (const id of canonicalIds) hasReport[id] = existing.has(id);

  return NextResponse.json({
    hasReport,
    isPecByServiceId,
    pecStatusByServiceId,
    isCompletedByServiceId,
    hasPhotoByServiceId,
    photoUrlByServiceId,
  });
}
