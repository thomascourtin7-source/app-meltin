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
    console.warn(
      "[planning-broadcast-all] VAPID incomplet — 0 envoi (voir NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)"
    );
    return { sent: 0, failed: 0 };
  }

  const openUrl = payload.openUrl?.trim() || "/";
  const subs = await getPlanningPushTargets();
  if (subs.length === 0) {
    console.warn(
      "[planning-broadcast-all] Aucun abonnement (table push_subscriptions / fichier local)"
    );
  }
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

const ALARM_UNCOVERED_TITLE = "🚨 RAJOUT 🚨";
const ALARM_UNCOVERED_BODY = "who can do it ?";

function normalizeRdvToTitleSuffix(rdv: string | null | undefined): string {
  const t = String(rdv ?? "").trim();
  if (!t) return "";
  // If it's a range like "06:45 - 09:45", keep only the start.
  const start = t.split(/[-–—]/)[0]?.trim() ?? "";
  if (!start) return "";

  // Accept "08:30", "8:30", "08h30", "08:30:00", etc.
  const m = /^(\d{1,2})\s*(?:[:hH])\s*(\d{2})/.exec(start);
  if (!m) return "";
  const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Cas 5 : service avec alarme non couvert — diffusion à tous les abonnés. */
export async function broadcastAlarmUncoveredPush(opts?: {
  rdv?: string | null;
  /** Identifiant canonique du service (date|vol|RDV) pour le deep-link au clic. */
  serviceId?: string | null;
  /** Date du service (YYYY-MM-DD) pour basculer l'affichage au clic. */
  date?: string | null;
}): Promise<{
  sent: number;
  failed: number;
}> {
  console.log("Tentative d'envoi push pour :", "planning-alarm-uncovered");

  if (!configureWebPush()) {
    console.warn(
      "[planning-alarm-uncovered] VAPID incomplet — 0 envoi"
    );
    return { sent: 0, failed: 0 };
  }

  const serviceId = opts?.serviceId?.trim() || "";
  const date = opts?.date?.trim() || "";
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (serviceId) params.set("serviceId", serviceId);
  const query = params.toString();
  const openUrl = query ? `/planning?${query}` : "/planning";
  const subs = await getPlanningPushTargets();
  if (subs.length === 0) {
    console.warn("[planning-alarm-uncovered] Aucun abonnement push");
  }
  let sent = 0;
  let failed = 0;

  const rdv = normalizeRdvToTitleSuffix(opts?.rdv ?? null);
  const title = rdv ? `${ALARM_UNCOVERED_TITLE} ${rdv}` : ALARM_UNCOVERED_TITLE;

  for (const raw of subs) {
    const r = await sendPushNotification(
      raw,
      title,
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
