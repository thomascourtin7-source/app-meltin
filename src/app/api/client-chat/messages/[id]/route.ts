import { NextResponse } from "next/server";

import { CLIENT_CHAT_MESSAGE_SELECT } from "@/lib/client-chat/client-chat-message-select";
import type { ClientChatMessageRow } from "@/lib/client-chat/types";
import { requirePlanningAgentBearer } from "@/lib/auth/planning-agent-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function loadOwnedAgentMessage(id: string, agentName: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Supabase admin non configuré." },
        { status: 500 }
      ),
      row: null,
      supabase: null,
    };
  }

  const messageId = id.trim();
  if (!messageId) {
    return {
      error: NextResponse.json({ error: "Message introuvable." }, { status: 404 }),
      row: null,
      supabase,
    };
  }

  const { data, error } = await supabase
    .from("client_chat_messages")
    .select(CLIENT_CHAT_MESSAGE_SELECT)
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json({ error: error.message }, { status: 500 }),
      row: null,
      supabase,
    };
  }

  const row = data as ClientChatMessageRow | null;
  if (!row) {
    return {
      error: NextResponse.json({ error: "Message introuvable." }, { status: 404 }),
      row: null,
      supabase,
    };
  }

  if (row.sender_type !== "agent" || !namesMatch(row.sender_name, agentName)) {
    return {
      error: NextResponse.json({ error: "Non autorisé." }, { status: 403 }),
      row: null,
      supabase,
    };
  }

  return { error: null, row, supabase };
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requirePlanningAgentBearer(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
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

  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message requis (1–2000 caractères)." },
      { status: 400 }
    );
  }

  const owned = await loadOwnedAgentMessage(id, auth.agentName);
  if (owned.error) return owned.error;
  if (!owned.row || !owned.supabase) {
    return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  }

  const { data, error } = await owned.supabase
    .from("client_chat_messages")
    .update({
      message,
      edited_at: new Date().toISOString(),
    })
    .eq("id", owned.row.id)
    .select(CLIENT_CHAT_MESSAGE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data as ClientChatMessageRow });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requirePlanningAgentBearer(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const owned = await loadOwnedAgentMessage(id, auth.agentName);
  if (owned.error) return owned.error;
  if (!owned.row || !owned.supabase) {
    return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  }

  const { error } = await owned.supabase
    .from("client_chat_messages")
    .delete()
    .eq("id", owned.row.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: owned.row.id });
}
