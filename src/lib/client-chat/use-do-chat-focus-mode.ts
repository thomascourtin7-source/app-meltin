"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { pickFocusServiceIdFromAwaiting } from "@/lib/client-chat/do-chat-awaiting-reply";
import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type UseDoChatFocusModeOpts = {
  spreadsheetId: string;
  /** Services assignés à l'agent connecté (identifiants canoniques). */
  monitoredServiceIds: string[];
  enabled: boolean;
};

export function useDoChatFocusMode({
  spreadsheetId,
  monitoredServiceIds,
  enabled,
}: UseDoChatFocusModeOpts) {
  const [awaitingReplyServiceIds, setAwaitingReplyServiceIds] = useState<
    string[]
  >([]);

  const monitoredKey = useMemo(
    () => monitoredServiceIds.join("\u0001"),
    [monitoredServiceIds]
  );

  const refresh = useCallback(async () => {
    if (!enabled || !spreadsheetId.trim() || monitoredServiceIds.length === 0) {
      setAwaitingReplyServiceIds([]);
      return;
    }

    const session = readPlanningAuthSession();
    if (!session?.token) {
      setAwaitingReplyServiceIds([]);
      return;
    }

    try {
      const res = await fetch("/api/client-chat/awaiting-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          spreadsheetId,
          serviceIds: monitoredServiceIds,
        }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        setAwaitingReplyServiceIds([]);
        return;
      }
      const parsed = json as { awaitingReplyServiceIds?: unknown };
      const ids = Array.isArray(parsed.awaitingReplyServiceIds)
        ? parsed.awaitingReplyServiceIds.filter(
            (id): id is string => typeof id === "string" && Boolean(id.trim())
          )
        : [];
      setAwaitingReplyServiceIds(ids);
    } catch {
      setAwaitingReplyServiceIds([]);
    }
  }, [enabled, monitoredKey, monitoredServiceIds, spreadsheetId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !spreadsheetId.trim()) return;

    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const channelId = `do_chat_focus_${spreadsheetId}_${Date.now()}`;
    const channel = sb
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_chat_messages",
          filter: `spreadsheet_id=eq.${spreadsheetId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, refresh, spreadsheetId]);

  const focusServiceId = useMemo(
    () => pickFocusServiceIdFromAwaiting(awaitingReplyServiceIds),
    [awaitingReplyServiceIds]
  );

  return {
    focusServiceId,
    awaitingReplyCount: awaitingReplyServiceIds.length,
    refresh,
  };
}
