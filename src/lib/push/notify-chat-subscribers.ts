import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendPushNotification,
  truncatePushBody,
} from "@/lib/notifications";

export type ChatMessagePushInput = {
  id: string;
  sender_name: string;
  content: string;
  image_url: string | null;
};

function normSender(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Handles @mention dans le corps (prénoms type chat). */
function extractMentionNorms(content: string): Set<string> {
  const set = new Set<string>();
  const re = /@([\wÀ-ÿ][\wÀ-ÿ\-]*)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const n = normSender(m[1]);
    if (n) set.add(n);
  }
  return set;
}

/**
 * Envoie une notification push à tous les abonnés sauf l’expéditeur.
 * Mention : titre « 👤 [Prénom] (Mention) », sinon titre = prénom expéditeur.
 */
export async function notifyChatSubscribersExceptSender(
  message: ChatMessagePushInput
): Promise<{ sent: number; failed: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { sent: 0, failed: 0 };

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_name");

  if (error || !rows?.length) return { sent: 0, failed: 0 };

  const senderNorm = normSender(message.sender_name);
  const rawText =
    message.image_url?.trim() && !message.content.trim()
      ? "Photo"
      : message.content.trim() || "Message";
  const body = truncatePushBody(rawText);
  const mentionNorms = extractMentionNorms(message.content);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const userNorm = normSender(String(row.user_name ?? ""));
    if (!userNorm || userNorm === senderNorm) continue;

    const isMentioned = mentionNorms.has(userNorm);
    const title = isMentioned
      ? `👤 ${message.sender_name.trim()} (Mention)`
      : message.sender_name.trim();

    const result = await sendPushNotification(
      {
        endpoint: row.endpoint as string,
        keys: {
          p256dh: row.p256dh as string,
          auth: row.auth as string,
        },
      },
      title,
      body,
      "/chat",
      { variant: "chat", messageId: message.id }
    );
    if (result.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}
