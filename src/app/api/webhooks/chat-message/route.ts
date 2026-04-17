import { NextResponse } from "next/server";

import { notifyChatSubscribersExceptSender } from "@/lib/push/notify-chat-subscribers";

type MessageRecord = {
  id: string;
  room_id: string;
  sender_name: string;
  content: string;
  image_url: string | null;
};

function parseRecord(body: unknown): MessageRecord | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  const record =
    o.record && typeof o.record === "object"
      ? (o.record as Record<string, unknown>)
      : o;

  const id = typeof record.id === "string" ? record.id : null;
  const room_id =
    typeof record.room_id === "string" ? record.room_id : "general";
  const sender_name =
    typeof record.sender_name === "string" ? record.sender_name : null;
  const content =
    typeof record.content === "string" ? record.content : "";
  const image_url =
    record.image_url === null || typeof record.image_url === "string"
      ? (record.image_url as string | null)
      : null;

  if (!id || !sender_name) return null;
  return { id, room_id, sender_name, content, image_url };
}

export async function POST(req: Request) {
  const secret = process.env.CHAT_MESSAGE_WEBHOOK_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const record = parseRecord(body);
  if (!record) {
    return NextResponse.json({ error: "Payload invalide." }, { status: 400 });
  }

  if (record.room_id !== "general") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await notifyChatSubscribersExceptSender({
    id: record.id,
    sender_name: record.sender_name,
    content: record.content,
    image_url: record.image_url,
  });

  return NextResponse.json({ ok: true, ...result });
}
