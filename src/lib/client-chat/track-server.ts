import { pecStatusFromStored, pecStatusToIsPec } from "@/lib/planning/pec-status";
import {
  formatPassengerServiceTitleEn,
  resolveTrackServiceStatusEn,
} from "@/lib/client-chat/service-status";
import { snapshotFromReportRow } from "@/lib/client-chat/track-timeline";
import type { TrackServicePayload } from "@/lib/client-chat/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ServiceRow = {
  spreadsheet_id: string;
  service_id: string;
  share_token: string | null;
  passenger_label: string | null;
};

function firstRealAgentName(raw: string | null | undefined): string | null {
  const name = String(raw ?? "").trim();
  if (!name) return null;
  const parts = name.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  const real = parts.find((p) => p && p !== "🚨" && !/^n\/a$/i.test(p));
  return real ?? parts[0] ?? null;
}

export async function loadTrackPayloadByToken(
  shareToken: string
): Promise<TrackServicePayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const token = shareToken.trim();
  if (!token) return null;

  const { data: serviceRow, error: serviceErr } = await supabase
    .from("services")
    .select("spreadsheet_id,service_id,share_token,passenger_label")
    .eq("share_token", token)
    .maybeSingle();

  if (serviceErr || !serviceRow) return null;
  const service = serviceRow as ServiceRow;

  const [{ data: report }, { data: assignment }] = await Promise.all([
    supabase
      .from("service_reports")
      .select(
        "service_client,assignee_name,completed_at,is_pec,pec_status,photo_url,updated_at"
      )
      .eq("spreadsheet_id", service.spreadsheet_id)
      .eq("service_id", service.service_id)
      .maybeSingle(),
    supabase
      .from("planning_assignments")
      .select("agent_name,updated_at")
      .eq("service_id", service.service_id)
      .maybeSingle(),
  ]);

  const reportClient =
    typeof (report as { service_client?: unknown } | null)?.service_client ===
    "string"
      ? (report as { service_client: string }).service_client.trim()
      : "";
  const passengerRaw =
    service.passenger_label?.trim() ||
    reportClient ||
    "Passager";

  const agentFromAssign = firstRealAgentName(
    (assignment as { agent_name?: string | null } | null)?.agent_name
  );
  const agentFromReport = firstRealAgentName(
    (report as { assignee_name?: string | null } | null)?.assignee_name
  );
  const agentName = agentFromAssign ?? agentFromReport;

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
    (report as {
      pec_status?: string | null;
      is_pec?: boolean | null;
      photo_url?: string | null;
      completed_at?: string | null;
      updated_at?: string | null;
    } | null) ?? null,
    agentName,
    agentUpdatedAt
  );

  return {
    shareToken: token,
    spreadsheetId: service.spreadsheet_id,
    serviceId: service.service_id,
    passengerLabel: formatPassengerServiceTitleEn(passengerRaw),
    agentName,
    status: status.label,
    statusTone: status.tone,
    timeline,
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
