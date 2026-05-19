import {
  normalizePecStatus,
  pecStatusToIsPec,
  type PecStatus,
} from "@/lib/planning/pec-status";
import { formatLocalTimeHHMMSS } from "@/lib/reports/report-time";

/**
 * Applique pec_status / is_pec et l’heure de début (départs) sur le payload Supabase.
 * meeting_time n’est renseignée que lors du passage à `pec`.
 */
export function applyPecFieldsToServiceReportPayload(
  payload: Record<string, unknown>,
  opts: {
    pecStatus: PecStatus;
    reportKind: string;
  }
): void {
  const { pecStatus, reportKind } = opts;
  payload.pec_status = pecStatus;
  payload.is_pec = pecStatusToIsPec(pecStatus);

  if (reportKind !== "departure") return;

  if (pecStatus === "pec") {
    payload.meeting_time = formatLocalTimeHHMMSS();
  } else if (pecStatus === "vide") {
    payload.meeting_time = null;
  }
}

/** Dérive pec_status si seul is_pec (ancien client) est envoyé. */
export function resolvePecStatusFromBody(body: {
  pec_status?: unknown;
  is_pec?: unknown;
}): PecStatus | null {
  if (typeof body.pec_status === "string" && body.pec_status.trim()) {
    return normalizePecStatus(body.pec_status);
  }
  if (typeof body.is_pec === "boolean") {
    return body.is_pec ? "pec" : "vide";
  }
  return null;
}
