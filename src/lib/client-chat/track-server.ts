import { pecStatusFromStored, pecStatusToIsPec } from "@/lib/planning/pec-status";
import { resolveServiceReportKind } from "@/lib/planning/service-kind";
import { resolveTrackAgentNames } from "@/lib/client-chat/assigned-agents";
import {
  formatPassengerServiceTitleEn,
  resolveTrackServiceStatusEn,
} from "@/lib/client-chat/service-status";
import { snapshotFromReportRow } from "@/lib/client-chat/track-timeline";
import type { TrackServicePayload } from "@/lib/client-chat/types";
import type { ServiceReportRowSnapshotForPdf } from "@/lib/reports/service-report-pdf";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TRACK_REPORT_SELECT = [
  "service_client",
  "assignee_name",
  "service_type",
  "service_vol",
  "report_kind",
  "completed_at",
  "is_pec",
  "pec_status",
  "photo_url",
  "updated_at",
  "deplanning",
  "pax",
  "travel_class",
  "immigration_speed",
  "checkin_bags",
  "customs_control",
  "place_end_of_service",
  "comments",
  "no_show",
  "no_checked_bags",
  "tax_refund",
  "tax_refund_speed",
  "tax_refund_by",
  "immigration_security_speed",
  "vip_lounge",
  "boarding_end_of_service",
  "bags_status",
].join(",");

const TRACK_PDF_REPORT_SELECT = [
  "report_kind",
  "photo_url",
  "service_client",
  "service_type",
  "service_date",
  "service_vol",
  "service_rdv1",
  "service_rdv2",
  "service_dest_prov",
  "service_tel",
  "service_driver_info",
  "assignee_name",
  "meeting_time",
  "end_of_service",
  "pax",
  "deplanning",
  "immigration_speed",
  "immigration_security_speed",
  "travel_class",
  "checkin_bags",
  "customs_control",
  "place_end_of_service",
  "tax_refund",
  "tax_refund_speed",
  "tax_refund_by",
  "boarding_end_of_service",
  "vip_lounge",
  "comments",
  "bags_status",
  "transit_bags",
  "no_show",
  "no_checked_bags",
  "completed_at",
].join(",");

type ServiceRow = {
  spreadsheet_id: string;
  service_id: string;
  share_token: string | null;
  passenger_label: string | null;
  flight_label: string | null;
};

export async function loadTrackPayloadByToken(
  shareToken: string
): Promise<TrackServicePayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const token = shareToken.trim();
  if (!token) return null;

  const { data: serviceRow, error: serviceErr } = await supabase
    .from("services")
    .select("spreadsheet_id,service_id,share_token,passenger_label,flight_label")
    .eq("share_token", token)
    .maybeSingle();

  if (serviceErr || !serviceRow) return null;
  const service = serviceRow as ServiceRow;

  const [{ data: report }, { data: assignment }] = await Promise.all([
    supabase
      .from("service_reports")
      .select(TRACK_REPORT_SELECT)
      .eq("spreadsheet_id", service.spreadsheet_id)
      .eq("service_id", service.service_id)
      .maybeSingle(),
    supabase
      .from("planning_assignments")
      .select("agent_name,updated_at")
      .eq("service_id", service.service_id)
      .maybeSingle(),
  ]);

  const reportRow = report as { service_client?: unknown; service_vol?: unknown } | null;
  const reportClient =
    typeof reportRow?.service_client === "string"
      ? reportRow.service_client.trim()
      : "";
  const passengerRaw =
    service.passenger_label?.trim() ||
    reportClient ||
    "Passager";

  const agentName = resolveTrackAgentNames(
    (assignment as { agent_name?: string | null } | null)?.agent_name,
    (report as { assignee_name?: string | null } | null)?.assignee_name
  );

  const completedAt = (report as { completed_at?: string | null } | null)
    ?.completed_at;
  const isCompleted =
    typeof completedAt === "string" && completedAt.trim().length > 0;
  const pecStatus = pecStatusFromStored(
    (report as { pec_status?: string; is_pec?: boolean } | null) ?? {}
  );
  const isPec = pecStatusToIsPec(pecStatus);
  const hasReport = Boolean(report);

  const status = resolveTrackServiceStatusEn({
    isCompleted,
    isPec,
    pecStatus,
    hasReport,
    agentName,
  });

  const agentUpdatedAt =
    typeof (assignment as { updated_at?: string | null } | null)?.updated_at ===
    "string"
      ? (assignment as { updated_at: string }).updated_at
      : null;

  const timeline = snapshotFromReportRow(
    (report as unknown as Parameters<typeof snapshotFromReportRow>[0]) ?? null,
    agentName,
    agentUpdatedAt
  );

  const reportVol =
    typeof reportRow?.service_vol === "string"
      ? reportRow.service_vol.trim()
      : "";
  const storedFlight =
    typeof service.flight_label === "string" ? service.flight_label.trim() : "";
  const flightNumbers = reportVol || storedFlight || null;

  return {
    shareToken: token,
    spreadsheetId: service.spreadsheet_id,
    serviceId: service.service_id,
    passengerLabel: formatPassengerServiceTitleEn(passengerRaw),
    agentName,
    status: status.label,
    statusTone: status.tone,
    timeline,
    missionReport: timeline.missionReport,
    flightNumbers,
  };
}

export async function loadServiceByShareToken(shareToken: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const token = shareToken.trim();
  if (!token) return null;
  const { data } = await supabase
    .from("services")
    .select("spreadsheet_id,service_id,share_token,passenger_label")
    .eq("share_token", token)
    .maybeSingle();
  return (data as ServiceRow | null) ?? null;
}

export async function loadTrackReportPdfByToken(shareToken: string): Promise<{
  row: ServiceReportRowSnapshotForPdf;
  reportKind: "arrival" | "departure" | "transit";
} | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const token = shareToken.trim();
  if (!token) return null;

  const service = await loadServiceByShareToken(token);
  if (!service) return null;

  const { data: report, error } = await supabase
    .from("service_reports")
    .select(TRACK_PDF_REPORT_SELECT)
    .eq("spreadsheet_id", service.spreadsheet_id)
    .eq("service_id", service.service_id)
    .maybeSingle();

  if (error || !report) return null;

  const completedAt = (report as { completed_at?: string | null }).completed_at;
  if (typeof completedAt !== "string" || !completedAt.trim()) return null;

  const row = report as unknown as ServiceReportRowSnapshotForPdf;
  const reportKind = resolveServiceReportKind({
    reportKindStored: row.report_kind,
    serviceType: row.service_type,
  });

  return { row, reportKind };
}
