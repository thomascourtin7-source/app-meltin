"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildTrackTimelineEvents,
  snapshotFromReportRow,
  type TrackMissionSnapshot,
  type TrackTimelineEvent,
} from "@/lib/client-chat/track-timeline";
import type { TrackServicePayload } from "@/lib/client-chat/types";
import { resolveTrackServiceStatusEn } from "@/lib/client-chat/service-status";
import { pecStatusFromStored, pecStatusToIsPec } from "@/lib/planning/pec-status";

type LiveTrackState = {
  payload: TrackServicePayload;
  snapshot: TrackMissionSnapshot;
  timeline: TrackTimelineEvent[];
};

function firstRealAgentName(raw: string | null | undefined): string | null {
  const name = String(raw ?? "").trim();
  if (!name) return null;
  const parts = name.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  const real = parts.find((p) => p && p !== "🚨" && !/^n\/a$/i.test(p));
  return real ?? parts[0] ?? null;
}

function buildPayloadFromParts(
  base: TrackServicePayload,
  snap: TrackMissionSnapshot
): TrackServicePayload {
  const isCompleted = Boolean(snap.completedAt?.trim());
  const pecStatus = snap.pecStatus;
  const isPec = pecStatusToIsPec(pecStatus);
  const hasReport =
    pecStatus !== "vide" || Boolean(snap.photoUrl) || isCompleted;

  const status = resolveTrackServiceStatusEn({
    isCompleted,
    isPec,
    pecStatus,
    hasReport,
    agentName: snap.agentName,
  });

  return {
    ...base,
    agentName: snap.agentName,
    status: status.label,
    statusTone: status.tone,
  };
}

export function useTrackMissionLive(shareToken: string) {
  const [state, setState] = useState<LiveTrackState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = shareToken.trim();
    if (!token) throw new Error("Invalid tracking link.");

    const res = await fetch(`/api/track/${encodeURIComponent(token)}`);
    const json: unknown = await res.json();
    if (!res.ok) {
      const msg =
        json &&
        typeof json === "object" &&
        "error" in json &&
        typeof (json as { error: unknown }).error === "string"
          ? (json as { error: string }).error
          : "Mission not found.";
      throw new Error(msg);
    }

    const payload = json as TrackServicePayload;
    const snap =
      payload.timeline ??
      snapshotFromReportRow(null, payload.agentName, null);
    return {
      payload: buildPayloadFromParts(payload, snap),
      snapshot: snap,
      timeline: buildTrackTimelineEvents(snap),
    };
  }, [shareToken]);

  useEffect(() => {
    if (!shareToken.trim()) {
      setError("Invalid tracking link.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const next = await reload();
        if (!cancelled) setState(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareToken, reload]);

  useEffect(() => {
    const spreadsheetId = state?.payload.spreadsheetId?.trim();
    const serviceId = state?.payload.serviceId?.trim();
    if (!spreadsheetId || !serviceId) return;

    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const channelId = `track_mission_${serviceId}_${Date.now()}`;
    const channel = sb
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_reports",
          filter: `service_id=eq.${serviceId}`,
        },
        (payload) => {
          const row = payload.new as {
            spreadsheet_id?: string;
            pec_status?: string | null;
            is_pec?: boolean | null;
            photo_url?: string | null;
            completed_at?: string | null;
            updated_at?: string | null;
            assignee_name?: string | null;
          };
          if (row.spreadsheet_id !== spreadsheetId) return;

          setState((prev) => {
            if (!prev) return prev;
            const agentName =
              firstRealAgentName(row.assignee_name) ?? prev.snapshot.agentName;
            const snap = snapshotFromReportRow(
              row,
              agentName,
              prev.snapshot.agentUpdatedAt
            );
            const nextPayload = buildPayloadFromParts(prev.payload, snap);
            return {
              payload: {
                ...nextPayload,
                passengerLabel: prev.payload.passengerLabel,
              },
              snapshot: snap,
              timeline: buildTrackTimelineEvents(snap),
            };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "service_reports",
          filter: `service_id=eq.${serviceId}`,
        },
        () => {
          void reload()
            .then((next) => setState(next))
            .catch(() => {});
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "planning_assignments",
          filter: `service_id=eq.${serviceId}`,
        },
        (payload) => {
          const row = payload.new as {
            agent_name?: string | null;
            updated_at?: string | null;
          };
          setState((prev) => {
            if (!prev) return prev;
            const agentName = firstRealAgentName(row.agent_name);
            const snap: TrackMissionSnapshot = {
              ...prev.snapshot,
              agentName,
              agentUpdatedAt:
                typeof row.updated_at === "string"
                  ? row.updated_at
                  : prev.snapshot.agentUpdatedAt,
            };
            return {
              payload: buildPayloadFromParts(prev.payload, snap),
              snapshot: snap,
              timeline: buildTrackTimelineEvents(snap),
            };
          });
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [state?.payload.spreadsheetId, state?.payload.serviceId, reload]);

  return useMemo(
    () => ({
      payload: state?.payload ?? null,
      timeline: state?.timeline ?? [],
      loading,
      error,
    }),
    [state, loading, error]
  );
}
