"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { notifyDoChatMessage } from "@/lib/client-chat/play-do-chat-alert";
import type { ClientChatMessageRow } from "@/lib/client-chat/types";
import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LAST_READ_PREFIX = "meltin_do_chat_last_read_";

function lastReadStorageKey(spreadsheetId: string, serviceId: string): string {
  return `${LAST_READ_PREFIX}${spreadsheetId}_${serviceId}`;
}

function readLastReadAt(spreadsheetId: string, serviceId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage
      .getItem(lastReadStorageKey(spreadsheetId, serviceId))
      ?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

function writeLastReadAt(
  spreadsheetId: string,
  serviceId: string,
  iso: string
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      lastReadStorageKey(spreadsheetId, serviceId),
      iso
    );
  } catch {
    /* ignore */
  }
}

function countUnreadClientMessages(
  messages: ClientChatMessageRow[],
  lastReadAt: string | null
): number {
  if (!lastReadAt) {
    return messages.filter((m) => m.sender_type === "client").length;
  }
  const cutoff = new Date(lastReadAt).getTime();
  return messages.filter((m) => {
    if (m.sender_type !== "client") return false;
    return new Date(m.created_at).getTime() > cutoff;
  }).length;
}

type UseDoChatUnreadOpts = {
  spreadsheetId: string;
  serviceId: string;
  enabled: boolean;
  chatOpen: boolean;
};

export function useDoChatUnread({
  spreadsheetId,
  serviceId,
  enabled,
  chatOpen,
}: UseDoChatUnreadOpts) {
  const [unreadCount, setUnreadCount] = useState(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    writeLastReadAt(spreadsheetId, serviceId, now);
    setUnreadCount(0);
  }, [spreadsheetId, serviceId]);

  useEffect(() => {
    if (!enabled || !spreadsheetId.trim() || !serviceId.trim()) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    void (async () => {
      const session = readPlanningAuthSession();
      if (!session?.token) return;

      try {
        const res = await fetch(
          `/api/client-chat/messages?spreadsheetId=${encodeURIComponent(spreadsheetId)}&serviceId=${encodeURIComponent(serviceId)}`,
          { headers: { Authorization: `Bearer ${session.token}` } }
        );
        const json: unknown = await res.json();
        if (!res.ok || cancelled) return;
        const parsed = json as { messages?: ClientChatMessageRow[] };
        const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
        const lastRead = readLastReadAt(spreadsheetId, serviceId);
        if (!cancelled) {
          setUnreadCount(countUnreadClientMessages(messages, lastRead));
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, spreadsheetId, serviceId]);

  useEffect(() => {
    if (chatOpen && enabled) {
      markAllRead();
    }
  }, [chatOpen, enabled, markAllRead]);

  useEffect(() => {
    if (!enabled || !spreadsheetId.trim() || !serviceId.trim()) return;

    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const channelId = `do_chat_unread_${serviceId}_${Date.now()}`;
    const channel = sb
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_chat_messages",
          filter: `service_id=eq.${serviceId}`,
        },
        (payload) => {
          const row = payload.new as ClientChatMessageRow;
          if (row.spreadsheet_id !== spreadsheetId) return;
          if (row.sender_type !== "client") return;

          if (chatOpenRef.current) {
            writeLastReadAt(spreadsheetId, serviceId, row.created_at);
            return;
          }

          const lastRead = readLastReadAt(spreadsheetId, serviceId);
          const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0;
          if (new Date(row.created_at).getTime() <= lastReadMs) return;

          setUnreadCount((n) => n + 1);
          notifyDoChatMessage({
            body: row.message,
            serviceId,
          });
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, spreadsheetId, serviceId]);

  return { unreadCount, markAllRead };
}
