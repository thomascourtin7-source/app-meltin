import { NextResponse } from "next/server";

import { requirePlanningAgentBearer } from "@/lib/auth/planning-agent-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type MessageLite = {
  service_id: string;
  sender_type: string;
  created_at: string;
};

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
  const serviceIdsRaw = (body as { serviceIds?: unknown }).serviceIds;
  const serviceIds = Array.isArray(serviceIdsRaw)
    ? [
        ...new Set(
          serviceIdsRaw
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        ),
      ]
    : [];

  if (!spreadsheetId || serviceIds.length === 0) {
    return NextResponse.json({ awaitingReplyServiceIds: [] as string[] });
  }

  const { data: activeRows, error: activeErr } = await supabase
    .from("services")
    .select("service_id")
    .eq("spreadsheet_id", spreadsheetId)
    .in("service_id", serviceIds)
    .eq("is_do_tracking_active", true);

  if (activeErr) {
    return NextResponse.json({ error: activeErr.message }, { status: 500 });
  }

  const activeIds = (activeRows ?? [])
    .map((r) => (r as { service_id?: unknown }).service_id)
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim()));

  if (activeIds.length === 0) {
    return NextResponse.json({ awaitingReplyServiceIds: [] as string[] });
  }

  const { data: messages, error: msgErr } = await supabase
    .from("client_chat_messages")
    .select("service_id,sender_type,created_at")
    .eq("spreadsheet_id", spreadsheetId)
    .in("service_id", activeIds)
    .order("created_at", { ascending: false });

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  const latestByService = new Map<string, MessageLite>();
  for (const row of messages ?? []) {
    const sid = (row as { service_id?: unknown }).service_id;
    if (typeof sid !== "string" || !sid.trim()) continue;
    if (latestByService.has(sid)) continue;
    latestByService.set(sid, row as MessageLite);
  }

  const awaiting: { serviceId: string; at: string }[] = [];
  for (const [serviceId, latest] of latestByService) {
    if (latest.sender_type === "client") {
      awaiting.push({ serviceId, at: latest.created_at });
    }
  }

  awaiting.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return NextResponse.json({
    awaitingReplyServiceIds: awaiting.map((a) => a.serviceId),
  });
}
