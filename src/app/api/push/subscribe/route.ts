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

  const senderRaw = (body as { senderName?: unknown }).senderName;
  const senderName =
    typeof senderRaw === "string" ? senderRaw.trim() : "";
  if (senderName.length < 1 || senderName.length > 120) {
    return NextResponse.json(
      { error: "Indiquez un prénom valide (senderName, 1–120 caractères)." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL manquant côté serveur.",
      },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        sender_name: senderName,
        updated_at: now,
      },
      { onConflict: "endpoint" }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: data?.id ?? null,
  });
}
