import { NextResponse } from "next/server";

import {
  loadServiceByShareToken,
  loadTrackPayloadByToken,
} from "@/lib/client-chat/track-server";
import type { ClientChatMessageRow } from "@/lib/client-chat/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré." },
      { status: 500 }
    );
  }

  const { token } = await context.params;
  const service = await loadServiceByShareToken(token);
  if (!service) {
    return NextResponse.json({ error: "Lien de suivi invalide." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("client_chat_messages")
    .select(
      "id,created_at,spreadsheet_id,service_id,sender_type,sender_name,message"
    )
    .eq("spreadsheet_id", service.spreadsheet_id)
    .eq("service_id", service.service_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    messages: (data ?? []) as ClientChatMessageRow[],
    track: await loadTrackPayloadByToken(token),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré." },
      { status: 500 }
    );
  }

  const { token } = await context.params;
  const service = await loadServiceByShareToken(token);
  if (!service) {
    return NextResponse.json({ error: "Lien de suivi invalide." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const message =
    typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  const senderName =
    typeof (body as { senderName?: unknown }).senderName === "string"
      ? (body as { senderName: string }).senderName.trim()
      : "Donneur d'ordre";

  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message requis (1–2000 caractères)." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("client_chat_messages")
    .insert({
      spreadsheet_id: service.spreadsheet_id,
      service_id: service.service_id,
      sender_type: "client",
      sender_name: senderName.slice(0, 120),
      message,
    })
    .select(
      "id,created_at,spreadsheet_id,service_id,sender_type,sender_name,message"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data as ClientChatMessageRow });
}
