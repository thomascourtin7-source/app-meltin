import {
  isEnPlaceLikeStatus,
  pecStatusFromStored,
  type PecStatus,
} from "@/lib/planning/pec-status";

export type TrackMissionSnapshot = {
  pecStatus: PecStatus;
  photoUrl: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  agentName: string | null;
  agentUpdatedAt: string | null;
};

export type TrackTimelineEventKind =
  | "assigned"
  | "on_position"
  | "passenger_met"
  | "photo"
  | "completed";

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

export function buildTrackTimelineEvents(
  snap: TrackMissionSnapshot
): TrackTimelineEvent[] {
  const events: TrackTimelineEvent[] = [];

  if (snap.agentName?.trim()) {
    events.push({
      id: "assigned",
      kind: "assigned",
      title: `Greeter assigned: ${snap.agentName.trim()}`,
      at: snap.agentUpdatedAt ?? null,
    });
  }

  const reachedPosition =
    isEnPlaceLikeStatus(snap.pecStatus) || snap.pecStatus === "pec";

  if (reachedPosition) {
    const detail = isEnPlaceLikeStatus(snap.pecStatus)
      ? positionDetail(snap.pecStatus)
      : undefined;
    events.push({
      id: "on_position",
      kind: "on_position",
      title: detail
        ? `Greeter is in position at ${detail}`
        : snap.pecStatus === "pec"
          ? "Greeter was in position"
          : "Greeter is in position",
      detail,
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

  return events;
}

export function snapshotFromReportRow(
  row: {
    pec_status?: string | null;
    is_pec?: boolean | null;
    photo_url?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
  } | null,
  agentName: string | null,
  agentUpdatedAt: string | null
): TrackMissionSnapshot {
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
  };
}
