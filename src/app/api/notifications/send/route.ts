import { NextResponse } from "next/server";
import { WebPushError } from "web-push";

import type { PushSubscriptionJSON } from "@/lib/push/subscriptions-store";
import { sendWebPushToSubscription } from "@/lib/push/send-notification";
import { applyVapidDetailsIfPossible } from "@/lib/push/vapid-config";

function isOriginAllowed(req: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!appUrl) return true;
  try {
    const allowed = new URL(appUrl).origin;
    const origin = req.headers.get("origin");
    if (!origin) return true;
    return origin === allowed;
  } catch {
    return true;
  }
}

/**
 * Envoi de test avec journalisation complète de la réponse HTTP du service Web Push
 * (Safari / Apple renvoie souvent le détail dans `body` sur 400/403).
 */
export async function POST(req: Request) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin non autorisée." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("subscription" in body) ||
    typeof (body as { subscription?: unknown }).subscription !== "object"
  ) {
    return NextResponse.json(
      { error: "Champ « subscription » attendu." },
      { status: 400 }
    );
  }

  const sub = (body as { subscription: PushSubscriptionJSON }).subscription;
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: "Subscription Web Push incomplète." },
      { status: 400 }
    );
  }

  /**
   * `webpush.setVapidDetails` : 1er argument = `process.env.VAPID_SUBJECT` (mailto: ou https:).
   * Sans sujet, Apple renvoie BadJwtToken — voir `applyVapidDetailsIfPossible`.
   */
  if (!applyVapidDetailsIfPossible()) {
    const missingSubject = !process.env.VAPID_SUBJECT?.trim();
    console.error(
      "[notifications/send] VAPID incomplet — setVapidDetails non appliqué.",
      missingSubject
        ? "Cause probable : VAPID_SUBJECT manquant (requis pour Apple)."
        : "Cause probable : NEXT_PUBLIC_VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY manquant."
    );
    return NextResponse.json(
      {
        error: missingSubject
          ? "VAPID_SUBJECT requis sur le serveur (ex. mailto:contact@votredomaine.com) pour Apple Web Push."
          : "Clés VAPID incomplètes côté serveur.",
        code: missingSubject ? "VAPID_SUBJECT_MISSING" : "VAPID_KEYS_MISSING",
      },
      { status: 503 }
    );
  }

  try {
    const result = await sendWebPushToSubscription(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      {
        type: "planning-update",
        title: "Test notifications/send",
        body: "Diagnostic Web Push — réponse serveur loggée côté Vercel.",
        openUrl: "/configuration",
      }
    );

    console.log(
      "[notifications/send] WebPush réponse complète (serveur push / ex. Apple) :",
      {
        statusCode: result.statusCode,
        headers: result.headers,
        body: result.body,
      }
    );

    return NextResponse.json({
      ok: true,
      statusCode: result.statusCode,
    });
  } catch (e) {
    if (e instanceof WebPushError) {
      console.log(
        "[notifications/send] WebPush erreur — réponse serveur push (ex. Apple 403/400) :",
        {
          statusCode: e.statusCode,
          headers: e.headers,
          body: e.body,
          endpoint: e.endpoint,
          message: e.message,
        }
      );
      return NextResponse.json(
        {
          ok: false,
          error: "WebPush refusé par le service push",
          statusCode: e.statusCode,
          pushBody: e.body,
        },
        { status: e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502 }
      );
    }
    const msg = e instanceof Error ? e.message : "Envoi impossible.";
    console.error("[notifications/send]", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
