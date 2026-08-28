import type { ClientChatMessageRow } from "@/lib/client-chat/types";

/** Dernier message du D.O. sans réponse agent ensuite. */
export function isDoChatAwaitingAgentReply(
  messages: ClientChatMessageRow[]
): boolean {
  if (messages.length === 0) return false;
  const sorted = [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const last = sorted[sorted.length - 1];
  return last.sender_type === "client";
}

export function pickFocusServiceIdFromAwaiting(
  awaitingReplyServiceIds: string[]
): string | null {
  return awaitingReplyServiceIds[0]?.trim() || null;
}

/** Trouve une ligne planning à partir d'un `service_id` (canonique ou legacy). */
export function findPlanningRowByServiceId<
  T extends {
    dateIso: string;
    sheetId?: string;
    client?: string;
    type?: string;
    vol?: string;
    rdv1?: string;
    rdv2?: string;
  },
>(
  rows: T[],
  serviceId: string,
  resolveCanonicalId: (row: T) => string,
  lookupIds: (row: T) => string[]
): T | undefined {
  const sid = serviceId.trim();
  if (!sid) return undefined;
  return rows.find(
    (row) =>
      resolveCanonicalId(row) === sid || lookupIds(row).includes(sid)
  );
}
