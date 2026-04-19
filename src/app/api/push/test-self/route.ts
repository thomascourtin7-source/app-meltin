import { NextResponse } from "next/server";

import type { PushSubscriptionJSON } from "@/lib/push/subscriptions-store";
import { sendWebPushToSubscription } from "@/lib/push/send-notification";

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

/** Test push vers l’abonnement courant (corps : subscription JSON du navigateur). */
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

  try {
    await sendWebPushToSubscription(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      {
        type: "planning-update",
        title: "Test Meltin",
        body: "Si vous voyez ceci sur l’iPhone, la chaîne Serveur → Apple → appareil fonctionne.",
        openUrl: "/configuration",
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Envoi impossible.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
