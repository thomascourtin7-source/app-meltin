import { NextResponse } from "next/server";

import { requirePlanningAgentBearer } from "@/lib/auth/planning-agent-server";
import { isDoLinkAuthorizedUser } from "@/lib/client-chat/do-tracking-access";
import { buildTrackUrl } from "@/lib/client-chat/share-token";
import { generateShareToken } from "@/lib/client-chat/share-token-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requirePlanningAgentBearer(request);
  if (!auth.ok) return auth.response;

  if (!isDoLinkAuthorizedUser(auth.agentName)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

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
  const passengerLabel =
    typeof (body as { passengerLabel?: unknown }).passengerLabel === "string"
      ? (body as { passengerLabel: string }).passengerLabel.trim()
      : "";

  if (!spreadsheetId || !serviceId) {
    return NextResponse.json(
      { error: "Champs spreadsheetId et serviceId requis." },
      { status: 400 }
    );
  }

  const { data: existing, error: readErr } = await supabase
    .from("services")
    .select("share_token,passenger_label,is_pec,is_starred,eta_time,is_do_tracking_active")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  let shareToken =
    typeof (existing as { share_token?: unknown } | null)?.share_token ===
    "string"
      ? (existing as { share_token: string }).share_token.trim()
      : "";

  if (!shareToken) {
    for (let attempt = 0; attempt < 5; attempt++) {
      shareToken = generateShareToken();
      const { error: upsertErr } = await supabase.from("services").upsert(
        {
          spreadsheet_id: spreadsheetId,
          service_id: serviceId,
          share_token: shareToken,
          passenger_label: passengerLabel || null,
          is_do_tracking_active: true,
          is_pec:
            typeof (existing as { is_pec?: unknown } | null)?.is_pec === "boolean"
              ? (existing as { is_pec: boolean }).is_pec
              : false,
          is_starred:
            typeof (existing as { is_starred?: unknown } | null)?.is_starred ===
            "boolean"
              ? (existing as { is_starred: boolean }).is_starred
              : false,
          eta_time:
            (existing as { eta_time?: string | null } | null)?.eta_time ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "spreadsheet_id,service_id" }
      );
      if (!upsertErr) break;
      if (!/duplicate|unique/i.test(upsertErr.message)) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }
      shareToken = "";
    }
  } else {
    const updatePayload: Record<string, unknown> = {
      is_do_tracking_active: true,
      updated_at: new Date().toISOString(),
    };
    if (passengerLabel) {
      updatePayload.passenger_label = passengerLabel;
    }
    await supabase
      .from("services")
      .update(updatePayload)
      .eq("spreadsheet_id", spreadsheetId)
      .eq("service_id", serviceId);
  }

  if (!shareToken) {
    return NextResponse.json(
      { error: "Impossible de générer un lien de suivi." },
      { status: 500 }
    );
  }

  const origin = request.headers.get("origin") ?? undefined;
  const trackUrl = buildTrackUrl(shareToken, origin);

  return NextResponse.json({ shareToken, trackUrl });
}
