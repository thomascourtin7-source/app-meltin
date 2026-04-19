/** Anti-doublon best-effort (même instance / fenêtre courte) — webhook + client. */
const recent = new Map<string, number>();

export function shouldSkipChatMessagePush(
  messageId: string,
  windowMs = 120_000
): boolean {
  const key = `chat:${messageId}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < windowMs) {
    return true;
  }
  recent.set(key, now);
  if (recent.size > 500) {
    for (const [k, t] of recent) {
      if (now - t > windowMs) recent.delete(k);
    }
  }
  return false;
}
