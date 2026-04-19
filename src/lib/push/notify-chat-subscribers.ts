import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyVapidDetailsIfPossible } from "@/lib/push/vapid-config";

export type ChatMessagePushInput = {
  id: string;
  sender_name: string;
  content: string;
  image_url: string | null;
};

/**
 * Envoie une notification push à tous les abonnés sauf ceux ayant le même `user_name` (prénom chat).
 */
export async function notifyChatSubscribersExceptSender(
  message: ChatMessagePushInput
): Promise<{ sent: number; failed: number }> {
  if (!applyVapidDetailsIfPossible()) return { sent: 0, failed: 0 };

  const admin = getSupabaseAdmin();
  if (!admin) return { sent: 0, failed: 0 };

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_name");

  if (error || !rows?.length) return { sent: 0, failed: 0 };

  const senderNorm = message.sender_name.trim();
  const text =
    message.image_url?.trim() && !message.content.trim()
      ? "Photo"
      : message.content.trim().slice(0, 200) || "Message";

  const payload = JSON.stringify({
    senderName: message.sender_name,
    text,
    messageId: message.id,
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if ((row.user_name as string).trim() === senderNorm) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint as string,
          keys: {
            p256dh: row.p256dh as string,
            auth: row.auth as string,
          },
        } as WebPushSubscription,
        payload,
        { TTL: 60 }
      );
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
