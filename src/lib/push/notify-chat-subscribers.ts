import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:planning@localhost";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export type ChatMessagePushInput = {
  id: string;
  sender_name: string;
  content: string;
  image_url: string | null;
};

/**
 * Envoie une notification push à tous les abonnés sauf ceux ayant le même sender_name (prénom chat).
 */
export async function notifyChatSubscribersExceptSender(
  message: ChatMessagePushInput
): Promise<{ sent: number; failed: number }> {
  if (!configureWebPush()) return { sent: 0, failed: 0 };

  const admin = getSupabaseAdmin();
  if (!admin) return { sent: 0, failed: 0 };

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, sender_name");

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
    if ((row.sender_name as string).trim() === senderNorm) continue;
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
