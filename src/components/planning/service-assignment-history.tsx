"use client";

import { useEffect, useState } from "react";

import {
  formatAssignmentLogLine,
  type ServiceAssignmentLogRow,
} from "@/lib/planning/service-assignment-log";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ServiceAssignmentHistoryProps = {
  serviceId: string;
  enabled: boolean;
};

export function ServiceAssignmentHistory({
  serviceId,
  enabled,
}: ServiceAssignmentHistoryProps) {
  const [logs, setLogs] = useState<ServiceAssignmentLogRow[]>([]);

  useEffect(() => {
    const sid = serviceId.trim();
    if (!enabled || !sid) {
      setLogs([]);
      return;
    }

    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    let cancelled = false;

    const load = async () => {
      const { data, error } = await sb
        .from("service_assignment_logs")
        .select("id,service_id,changed_by,old_agent,new_agent,created_at")
        .eq("service_id", sid)
        .order("created_at", { ascending: false });

      if (cancelled || error) return;
      setLogs((data ?? []) as ServiceAssignmentLogRow[]);
    };

    void load();

    const channel = sb
      .channel(`service_assignment_logs:${sid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "service_assignment_logs",
          filter: `service_id=eq.${sid}`,
        },
        (payload) => {
          const row = payload.new as ServiceAssignmentLogRow | null;
          if (!row?.id) return;
          setLogs((prev) => {
            if (prev.some((entry) => entry.id === row.id)) return prev;
            return [row, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [enabled, serviceId]);

  if (!enabled || logs.length === 0) return null;

  return (
    <div className="mt-2 space-y-0.5 border-t border-gray-700/50 pt-1.5 text-[11px] italic text-gray-400">
      {logs.map((log) => (
        <p key={log.id}>{formatAssignmentLogLine(log)}</p>
      ))}
    </div>
  );
}
