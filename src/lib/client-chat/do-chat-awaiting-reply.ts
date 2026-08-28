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
