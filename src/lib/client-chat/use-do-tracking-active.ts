"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useDoTrackingActive(
  spreadsheetId: string,
  serviceId: string
): {
  isActive: boolean;
  setActive: (value: boolean) => void;
  refresh: () => Promise<void>;
} {
  const [isActive, setIsActive] = useState(false);

  const refresh = useCallback(async () => {
    const sid = spreadsheetId.trim();
    const svc = serviceId.trim();
    if (!sid || !svc) {
      setIsActive(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/services?spreadsheetId=${encodeURIComponent(sid)}&serviceId=${encodeURIComponent(svc)}`
      );
      const json: unknown = await res.json();
      if (!res.ok) return;
      const service =
        json &&
        typeof json === "object" &&
        (json as { service?: unknown }).service &&
        typeof (json as { service: unknown }).service === "object"
          ? ((json as { service: Record<string, unknown> }).service as Record<
              string,
              unknown
            >)
          : null;
      const flag = service?.is_do_tracking_active;
      setIsActive(typeof flag === "boolean" ? flag : false);
    } catch {
      /* ignore */
    }
  }, [spreadsheetId, serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sid = spreadsheetId.trim();
    const svc = serviceId.trim();
    if (!sid || !svc) return;

    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const channelId = `do_tracking_active_${svc}_${Date.now()}`;
    const channel = sb
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "services",
          filter: `service_id=eq.${svc}`,
        },
        (payload) => {
          const row = payload.new as {
            spreadsheet_id?: string;
            is_do_tracking_active?: boolean;
          };
          if (row.spreadsheet_id !== sid) return;
          if (typeof row.is_do_tracking_active === "boolean") {
            setIsActive(row.is_do_tracking_active);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "services",
          filter: `service_id=eq.${svc}`,
        },
        (payload) => {
          const row = payload.new as {
            spreadsheet_id?: string;
            is_do_tracking_active?: boolean;
          };
          if (row.spreadsheet_id !== sid) return;
          if (typeof row.is_do_tracking_active === "boolean") {
            setIsActive(row.is_do_tracking_active);
          }
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [spreadsheetId, serviceId]);

  const setActive = useCallback((value: boolean) => {
    setIsActive(value);
  }, []);

  return { isActive, setActive, refresh };
}
