import {
  isEnPlaceLikeStatus,
  pecStatusFromStored,
  type PecStatus,
} from "@/lib/planning/pec-status";

export type TrackTimelineAtRow = {
  pec_status?: string | null;
  is_pec?: boolean | null;
  photo_url?: string | null;
  on_position_at?: string | null;
  pec_at?: string | null;
  photo_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

function trimIso(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Renseigne les horodatages figés de la timeline lors d’un changement de statut /
 * photo. Chaque champ n’est écrit qu’une seule fois (premier enregistrement).
 */
export function applyFrozenTimelineTimestamps(
  payload: Record<string, unknown>,
  opts: {
    existing: TrackTimelineAtRow | null;
    nextPecStatus: PecStatus | null;
    nextPhotoUrl: string | null;
    nowIso?: string;
  }
): void {
  delete payload.on_position_at;
  delete payload.pec_at;
  delete payload.photo_at;

  const now = opts.nowIso ?? new Date().toISOString();
  const existing = opts.existing;
  const prevPec = pecStatusFromStored(existing ?? {});

  if (opts.nextPecStatus !== null && opts.nextPecStatus !== prevPec) {
    if (isEnPlaceLikeStatus(opts.nextPecStatus) && !trimIso(existing?.on_position_at)) {
      payload.on_position_at = now;
    }
    if (opts.nextPecStatus === "pec") {
      if (!trimIso(existing?.pec_at)) {
        payload.pec_at = now;
      }
      if (!trimIso(existing?.on_position_at)) {
        payload.on_position_at = now;
      }
    }
  }

  const prevPhoto = trimIso(existing?.photo_url);
  const nextPhoto = trimIso(opts.nextPhotoUrl);
  if (nextPhoto && !prevPhoto && !trimIso(existing?.photo_at)) {
    payload.photo_at = now;
  }
}

export function resolveTrackEventAt(
  frozen: string | null | undefined,
  fallback?: string | null
): string | null {
  return trimIso(frozen) ?? trimIso(fallback);
}
