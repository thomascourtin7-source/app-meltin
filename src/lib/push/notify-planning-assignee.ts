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

function normSender(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Envoie une notification push uniquement aux abonnés dont `user_name`
 * correspond au membre ciblé (ex. « Simon », comme après « S'enregistrer »).
 */
export async function notifyPlanningAssigneeSubscribers(
  targetDisplayName: string,
  payload: { title: string; body: string }
): Promise<{ sent: number; failed: number }> {
  if (!configureWebPush()) return { sent: 0, failed: 0 };

  const admin = getSupabaseAdmin();
  if (!admin) return { sent: 0, failed: 0 };

  const want = normSender(targetDisplayName);
  if (!want) return { sent: 0, failed: 0 };

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_name");

  if (error || !rows?.length) return { sent: 0, failed: 0 };

  const targets = rows.filter(
    (r) => normSender(String(r.user_name ?? "")) === want
  );

  const body = JSON.stringify({
    type: "planning-update",
    title: payload.title,
    body: payload.body,
    openUrl: "/",
  });

  let sent = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint as string,
          keys: {
            p256dh: row.p256dh as string,
            auth: row.auth as string,
          },
        } as WebPushSubscription,
        body,
        { TTL: 3600 }
      );
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
