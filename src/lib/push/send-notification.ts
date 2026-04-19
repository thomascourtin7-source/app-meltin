import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { getAllSubscriptions } from "./subscriptions-store";

/**
 * Exemple d’envoi côté serveur (cron, route sécurisée, webhook Sheets, etc.).
 * À appeler uniquement lorsque VAPID_PRIVATE_KEY et NEXT_PUBLIC_VAPID_PUBLIC_KEY sont définis.
 */
export function configureWebPush(): void {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:planning@localhost";

  if (!publicKey || !privateKey) return;

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function getPlanningPushTargets(): Promise<
  { endpoint: string; keys: { p256dh: string; auth: string } }[]
> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    if (!error && data?.length) {
      return data.map((row) => ({
        endpoint: row.endpoint as string,
        keys: {
          p256dh: row.p256dh as string,
          auth: row.auth as string,
        },
      }));
    }
  }
  return getAllSubscriptions().map((s) => ({
    endpoint: s.endpoint,
    keys: s.keys,
  }));
}

export async function broadcastPlanningUpdate(payload: {
  title: string;
  body: string;
  /** Chemin ou URL relative pour l’ouverture au clic (ex. /planning?date=tomorrow). */
  openUrl?: string;
}): Promise<{ sent: number; failed: number }> {
  configureWebPush();
  if (!process.env.VAPID_PRIVATE_KEY) {
    return { sent: 0, failed: 0 };
  }

  const openUrl = payload.openUrl?.trim() || "/";
  const subs = await getPlanningPushTargets();
  let sent = 0;
  let failed = 0;

  for (const raw of subs) {
    try {
      await webpush.sendNotification(
        raw as WebPushSubscription,
        JSON.stringify({
          type: "planning-update",
          title: payload.title,
          body: payload.body,
          openUrl,
        })
      );
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

/** Envoi d’une seule notification Web Push (ex. test « à moi-même »). */
export async function sendWebPushToSubscription(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, unknown>
): Promise<void> {
  configureWebPush();
  if (!process.env.VAPID_PRIVATE_KEY) {
    throw new Error("VAPID non configuré.");
  }
  await webpush.sendNotification(
    sub as WebPushSubscription,
    JSON.stringify(payload)
  );
}
