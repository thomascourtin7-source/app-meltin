import { NextResponse } from "next/server";

import { requirePlanningAgentBearer } from "@/lib/auth/planning-agent-server";
import { CLIENT_CHAT_MESSAGE_SELECT } from "@/lib/client-chat/client-chat-message-select";
import type { ClientChatMessageRow } from "@/lib/client-chat/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requirePlanningAgentBearer(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim() || "";
  const serviceId = url.searchParams.get("serviceId")?.trim() || "";
  if (!spreadsheetId || !serviceId) {
    return NextResponse.json(
      { error: "Paramètres spreadsheetId et serviceId requis." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("client_chat_messages")
    .select(CLIENT_CHAT_MESSAGE_SELECT)
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: (data ?? []) as ClientChatMessageRow[] });
}

export async function POST(request: Request) {
  const auth = await requirePlanningAgentBearer(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const spreadsheetId =
    typeof (body as { spreadsheetId?: unknown }).spreadsheetId === "string"
      ? (body as { spreadsheetId: string }).spreadsheetId.trim()
      : "";
  const serviceId =
    typeof (body as { serviceId?: unknown }).serviceId === "string"
      ? (body as { serviceId: string }).serviceId.trim()
      : "";
  const message =
    typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";

  if (!spreadsheetId || !serviceId) {
    return NextResponse.json(
      { error: "Champs spreadsheetId et serviceId requis." },
      { status: 400 }
    );
  }
  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message requis (1–2000 caractères)." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("client_chat_messages")
    .insert({
      spreadsheet_id: spreadsheetId,
      service_id: serviceId,
      sender_type: "agent",
      sender_name: auth.agentName.slice(0, 120),
      message,
    })
    .select(CLIENT_CHAT_MESSAGE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data as ClientChatMessageRow });
}
