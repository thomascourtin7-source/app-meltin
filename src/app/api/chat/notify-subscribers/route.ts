import { NextResponse } from "next/server";

import { notifyChatSubscribersExceptSender } from "@/lib/push/notify-chat-subscribers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Body = {
  id?: string;
  room_id?: string;
  sender_name?: string;
  content?: string;
  image_url?: string | null;
};

/**
 * Déclenché par le client après insertion d’un message (complément au webhook Supabase).
 * Vérifie la ligne en base pour éviter les envois forgés.
 */
export async function POST(req: Request) {
  console.log("Tentative d'envoi push pour :", "chat-notify-subscribers-route");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn("Tentative d'envoi push pour :", "chat-notify-no-admin");
    return NextResponse.json(
      { error: "Service indisponible (Supabase admin)." },
      { status: 503 }
    );
  }

  const { data: row, error } = await admin
    .from("messages")
    .select("id, room_id, sender_name, content, image_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    console.warn("Tentative d'envoi push pour :", "chat-notify-message-missing");
    return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  }

  const sender_name =
    typeof body.sender_name === "string" ? body.sender_name : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (
    row.sender_name !== sender_name ||
    row.content !== content ||
    (row.room_id ?? "general") !== (body.room_id ?? "general")
  ) {
    return NextResponse.json({ error: "Corps ne correspond pas au message." }, { status: 400 });
  }

  const result = await notifyChatSubscribersExceptSender({
    id: row.id as string,
    sender_name: row.sender_name as string,
    content: row.content as string,
    image_url:
      row.image_url === null || typeof row.image_url === "string"
        ? (row.image_url as string | null)
        : null,
  });

  return NextResponse.json({ ok: true, ...result });
}
