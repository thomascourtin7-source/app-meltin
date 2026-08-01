import {
  isEnPlaceLikeStatus,
  pecStatusFromStored,
  type PecStatus,
} from "@/lib/planning/pec-status";
import { assignedTimelineTitle } from "@/lib/client-chat/assigned-agents";
import {
  ARRIVAL_EP_BLOC_MESSAGE,
  ARRIVAL_EP_LARGE_MESSAGE,
  isDoTrackArrivalEpMessage,
} from "@/lib/client-chat/track-arrival-ep";
import {
  buildTrackMissionReportSummary,
  type TrackMissionReportSummary,
  type TrackReportRowSlice,
} from "@/lib/client-chat/track-report-summary";

export type TrackMissionSnapshot = {
  pecStatus: PecStatus;
  photoUrl: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  agentName: string | null;
  agentUpdatedAt: string | null;
  serviceType: string | null;
  reportKind: string | null;
  deplanning: string | null;
  missionReport: TrackMissionReportSummary | null;
};

export type TrackTimelineEventKind =
  | "assigned"
  | "on_position"
  | "passenger_met"
  | "photo"
  | "completed"
  | "mission_report";

export type TrackTimelineEvent = {
  id: string;
  kind: TrackTimelineEventKind;
  title: string;
  detail?: string;
  at: string | null;
  photoUrl?: string;
};

function positionDetail(status: PecStatus): string | undefined {
  if (status === "ep_large") return "Large";
  if (status === "ep_bloc") return "Block";
  if (status === "en_place") return "Meeting point";
  return undefined;
}

function resolveOnPositionTitle(snap: TrackMissionSnapshot): string {
  const arrivalLike = isDoTrackArrivalEpMessage(
    snap.serviceType,
    snap.reportKind
  );
  const deplan = (snap.deplanning ?? "").trim().toLowerCase();

  if (arrivalLike) {
    if (snap.pecStatus === "ep_bloc" || deplan === "block") {
      return ARRIVAL_EP_BLOC_MESSAGE;
    }
    if (snap.pecStatus === "ep_large" || deplan === "large") {
      return ARRIVAL_EP_LARGE_MESSAGE;
    }
  }

  const detail = isEnPlaceLikeStatus(snap.pecStatus)
    ? positionDetail(snap.pecStatus)
    : undefined;

  if (detail) {
    return `Greeter is in position at ${detail}`;
  }
  if (snap.pecStatus === "pec") {
    return "Greeter was in position";
  }
  return "Greeter is in position";
}

export function buildTrackTimelineEvents(
  snap: TrackMissionSnapshot
): TrackTimelineEvent[] {
  const events: TrackTimelineEvent[] = [];

  if (snap.agentName?.trim()) {
    events.push({
      id: "assigned",
      kind: "assigned",
      title: assignedTimelineTitle(snap.agentName.trim()),
      at: snap.agentUpdatedAt ?? null,
    });
  }

  const reachedPosition =
    isEnPlaceLikeStatus(snap.pecStatus) || snap.pecStatus === "pec";

  if (reachedPosition) {
    events.push({
      id: "on_position",
      kind: "on_position",
      title: resolveOnPositionTitle(snap),
      at: snap.updatedAt,
    });
  }

  if (snap.pecStatus === "pec") {
    events.push({
      id: "passenger_met",
      kind: "passenger_met",
      title: "Greeter has met the passenger",
      at: snap.updatedAt,
    });
  }

  if (snap.photoUrl?.trim()) {
    events.push({
      id: "photo",
      kind: "photo",
      title: "Service Photo Confirmation",
      at: snap.updatedAt,
      photoUrl: snap.photoUrl.trim(),
    });
  }

  if (snap.completedAt?.trim()) {
    events.push({
      id: "completed",
      kind: "completed",
      title: "Service completed successfully",
      at: snap.completedAt.trim(),
    });
  }

  if (snap.completedAt?.trim() && snap.missionReport) {
    events.push({
      id: "mission_report",
      kind: "mission_report",
      title: "Click here to see the report of the mission",
      at: snap.completedAt.trim(),
    });
  }

  return events;
}

export function snapshotFromReportRow(
  row: TrackReportRowSlice & {
    pec_status?: string | null;
    is_pec?: boolean | null;
    photo_url?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
  } | null,
  agentName: string | null,
  agentUpdatedAt: string | null
): TrackMissionSnapshot {
  const missionReport = buildTrackMissionReportSummary(row);

  return {
    pecStatus: pecStatusFromStored(row ?? {}),
    photoUrl:
      typeof row?.photo_url === "string" && row.photo_url.trim()
        ? row.photo_url.trim()
        : null,
    completedAt:
      typeof row?.completed_at === "string" && row.completed_at.trim()
        ? row.completed_at.trim()
        : null,
    updatedAt:
      typeof row?.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at.trim()
        : null,
    agentName,
    agentUpdatedAt,
    serviceType:
      typeof row?.service_type === "string" && row.service_type.trim()
        ? row.service_type.trim()
        : null,
    reportKind:
      typeof row?.report_kind === "string" && row.report_kind.trim()
        ? row.report_kind.trim()
        : null,
    deplanning:
      typeof row?.deplanning === "string" && row.deplanning.trim()
        ? row.deplanning.trim()
        : null,
    missionReport,
  };
}
