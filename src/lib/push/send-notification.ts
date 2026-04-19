import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";
import type { SendResult } from "web-push";

import { sendPushNotification } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { applyVapidDetailsIfPossible } from "./vapid-config";
import { getAllSubscriptions } from "./subscriptions-store";

/**
 * Configure VAPID pour les envois en masse. Retourne false si clés ou VAPID_SUBJECT manquants.
 */
export function configureWebPush(): boolean {
  return applyVapidDetailsIfPossible();
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
  console.log("Tentative d'envoi push pour :", "planning-broadcast-all");

  if (!configureWebPush()) {
    return { sent: 0, failed: 0 };
  }

  const openUrl = payload.openUrl?.trim() || "/";
  const subs = await getPlanningPushTargets();
  let sent = 0;
  let failed = 0;

  for (const raw of subs) {
    const r = await sendPushNotification(
      raw,
      payload.title,
      payload.body,
      openUrl,
      { variant: "planning" }
    );
    if (r.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

const ALARM_UNCOVERED_TITLE = "🚨 ALERTE : Service";
const ALARM_UNCOVERED_BODY =
  "Un service avec alarme est sans assignation. Action requise !";

/** Cas 5 : service avec alarme non couvert — diffusion à tous les abonnés. */
export async function broadcastAlarmUncoveredPush(): Promise<{
  sent: number;
  failed: number;
}> {
  console.log("Tentative d'envoi push pour :", "planning-alarm-uncovered");

  if (!configureWebPush()) {
    return { sent: 0, failed: 0 };
  }

  const openUrl = "/";
  const subs = await getPlanningPushTargets();
  let sent = 0;
  let failed = 0;

  for (const raw of subs) {
    const r = await sendPushNotification(
      raw,
      ALARM_UNCOVERED_TITLE,
      ALARM_UNCOVERED_BODY,
      openUrl,
      { variant: "planning" }
    );
    if (r.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

/** Envoi d’une seule notification Web Push (ex. test « à moi-même »). */
export async function sendWebPushToSubscription(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, unknown>
): Promise<SendResult> {
  if (!configureWebPush()) {
    throw new Error(
      "Web Push incomplet : définissez NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT (mailto:… requis pour Apple — sinon BadJwtToken). Voir logs [VAPID]."
    );
  }
  return webpush.sendNotification(
    sub as WebPushSubscription,
    JSON.stringify(payload)
  );
}
