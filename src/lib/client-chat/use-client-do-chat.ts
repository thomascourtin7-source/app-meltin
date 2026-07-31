"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import type { ClientChatMessageRow } from "@/lib/client-chat/types";

type UseClientDoChatOpts = {
  mode: "public" | "agent";
  shareToken?: string;
  spreadsheetId?: string;
  serviceId?: string;
  clientSenderName?: string;
};

export function useClientDoChat(opts: UseClientDoChatOpts) {
  const [messages, setMessages] = useState<ClientChatMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    setError(null);
    if (opts.mode === "public") {
      const token = opts.shareToken?.trim();
      if (!token) {
        setMessages([]);
        setLoading(false);
        return;
      }
      const res = await fetch(
        `/api/track/${encodeURIComponent(token)}/messages`
      );
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Impossible de charger les messages.";
        throw new Error(msg);
      }
      const parsed = json as { messages?: ClientChatMessageRow[] };
      setMessages(Array.isArray(parsed.messages) ? parsed.messages : []);
      return;
    }

    const spreadsheetId = opts.spreadsheetId?.trim();
    const serviceId = opts.serviceId?.trim();
    if (!spreadsheetId || !serviceId) {
      setMessages([]);
      return;
    }
    const session = readPlanningAuthSession();
    if (!session?.token) throw new Error("Session requise.");

    const res = await fetch(
      `/api/client-chat/messages?spreadsheetId=${encodeURIComponent(spreadsheetId)}&serviceId=${encodeURIComponent(serviceId)}`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    const json: unknown = await res.json();
    if (!res.ok) {
      const msg =
        json &&
        typeof json === "object" &&
        "error" in json &&
        typeof (json as { error: unknown }).error === "string"
          ? (json as { error: string }).error
          : "Impossible de charger les messages.";
      throw new Error(msg);
    }
    const parsed = json as { messages?: ClientChatMessageRow[] };
    setMessages(Array.isArray(parsed.messages) ? parsed.messages : []);
  }, [opts.mode, opts.shareToken, opts.spreadsheetId, opts.serviceId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await loadMessages();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur chargement.");
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMessages]);

  useEffect(() => {
    const serviceId = opts.serviceId?.trim();
    const spreadsheetId = opts.spreadsheetId?.trim();
    if (!serviceId || !spreadsheetId) return;

    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const channelId = `client_do_chat_${spreadsheetId}_${serviceId}_${Date.now()}`;
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [opts.serviceId, opts.spreadsheetId]);

  const sendMessage = useCallback(
    async (text: string, senderName?: string) => {
      const message = text.trim();
      if (!message) return;
      setSending(true);
      setError(null);
      try {
        if (opts.mode === "public") {
          const token = opts.shareToken?.trim();
          if (!token) throw new Error("Lien invalide.");
          const res = await fetch(
            `/api/track/${encodeURIComponent(token)}/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message,
                senderName:
                  senderName?.trim() ||
                  opts.clientSenderName?.trim() ||
                  "Donneur d'ordre",
              }),
            }
          );
          const json: unknown = await res.json();
          if (!res.ok) {
            const msg =
              json &&
              typeof json === "object" &&
              "error" in json &&
              typeof (json as { error: unknown }).error === "string"
                ? (json as { error: string }).error
                : "Envoi impossible.";
            throw new Error(msg);
          }
        } else {
          const spreadsheetId = opts.spreadsheetId?.trim();
          const serviceId = opts.serviceId?.trim();
          const session = readPlanningAuthSession();
          if (!spreadsheetId || !serviceId || !session?.token) {
            throw new Error("Session ou service manquant.");
          }
          const res = await fetch("/api/client-chat/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.token}`,
            },
            body: JSON.stringify({ spreadsheetId, serviceId, message }),
          });
          const json: unknown = await res.json();
          if (!res.ok) {
            const msg =
              json &&
              typeof json === "object" &&
              "error" in json &&
              typeof (json as { error: unknown }).error === "string"
                ? (json as { error: string }).error
                : "Envoi impossible.";
            throw new Error(msg);
          }
        }
      } finally {
        setSending(false);
      }
    },
    [opts.mode, opts.shareToken, opts.spreadsheetId, opts.serviceId, opts.clientSenderName]
  );

  return {
    messages,
    loading,
    error,
    sending,
    sendMessage,
    reload: loadMessages,
  };
}
