import type { RealtimeChannel } from "@supabase/supabase-js";

/** Même clé que le store local des assignations (pour sync multi-appareils). */
export const PLANNING_ASSIGNEES_STORAGE_KEY = "meltin_planning_assignees_v3";

export const PLANNING_ASSIGNEES_BROADCAST_EVENT = "assignees_changed" as const;

let assigneesChannel: RealtimeChannel | null = null;
let assigneesSpreadsheetId: string | null = null;

/** Appelé après `subscribe` (SUBSCRIBED) et au démontage du planning. */
export function setPlanningAssigneesRealtimeChannel(
  ch: RealtimeChannel | null,
  spreadsheetId: string | null
): void {
  assigneesChannel = ch;
  assigneesSpreadsheetId = spreadsheetId;
}

/** Notifie les autres appareils / onglets (Realtime broadcast). */
export function broadcastPlanningAssigneesChanged(spreadsheetId: string): void {
  if (!assigneesChannel || assigneesSpreadsheetId !== spreadsheetId) return;
  void assigneesChannel.send({
    type: "broadcast",
    event: PLANNING_ASSIGNEES_BROADCAST_EVENT,
    payload: { at: Date.now() },
  });
}
