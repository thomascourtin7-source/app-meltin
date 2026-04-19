import { NextResponse } from "next/server";

import {
  type PushSubscriptionJSON,
} from "@/lib/push/subscriptions-store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
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
  if (!sub.endpoint || !sub.keys) {
    return NextResponse.json(
      { error: "Subscription Web Push incomplète." },
      { status: 400 }
    );
  }

  const b = body as { userName?: unknown; senderName?: unknown };
  const nameRaw =
    typeof b.userName === "string"
      ? b.userName
      : typeof b.senderName === "string"
        ? b.senderName
        : "";
  const userName = nameRaw.trim();
  if (userName.length < 1 || userName.length > 120) {
    return NextResponse.json(
      {
        error:
          "Indiquez un nom valide (userName ou senderName, 1–120 caractères).",
      },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL manquant côté serveur.",
        offline: true,
      },
      { status: 503 }
    );
  }

  /** Safari iOS : l’endpoint est fourni par Apple (`…push.apple.com…`) — on le stocke tel quel. */
  if (sub.endpoint.includes("push.apple.com")) {
    console.log("[push/subscribe] enregistrement endpoint Apple Web Push");
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_name: userName,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message, offline: true },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
