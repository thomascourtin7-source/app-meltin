import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const spreadsheetId =
    typeof (body as { spreadsheet_id?: unknown }).spreadsheet_id === "string"
      ? ((body as { spreadsheet_id: string }).spreadsheet_id || "").trim()
      : "";
  const serviceId =
    typeof (body as { service_id?: unknown }).service_id === "string"
      ? ((body as { service_id: string }).service_id || "").trim()
      : "";
  const lbStatusRaw = (body as { lb_status?: unknown }).lb_status;
  const lbUpdatedByRaw = (body as { lb_updated_by?: unknown }).lb_updated_by;

  const lbStatus =
    lbStatusRaw === null
      ? null
      : lbStatusRaw === "large" || lbStatusRaw === "block"
        ? lbStatusRaw
        : undefined;

  if (!spreadsheetId || !serviceId || lbStatus === undefined) {
    return NextResponse.json(
      {
        error:
          "Champs requis manquants (spreadsheet_id, service_id, lb_status: large|block|null).",
      },
      { status: 400 }
    );
  }

  const lbUpdatedBy =
    lbStatus === null
      ? null
      : typeof lbUpdatedByRaw === "string"
        ? lbUpdatedByRaw.trim() || null
        : null;

  if (lbStatus !== null && !lbUpdatedBy) {
    return NextResponse.json(
      { error: "lb_updated_by requis lorsque lb_status est défini." },
      { status: 400 }
    );
  }

  const { data: existing, error: readErr } = await supabase
    .from("services")
    .select(
      "is_pec,is_starred,eta_time,is_do_tracking_active,share_token,passenger_label,flight_label"
    )
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const ex = existing as Record<string, unknown> | null;
  const nowIso = new Date().toISOString();

  const payload: Record<string, unknown> = {
    spreadsheet_id: spreadsheetId,
    service_id: serviceId,
    is_pec: typeof ex?.is_pec === "boolean" ? ex.is_pec : false,
    is_starred: typeof ex?.is_starred === "boolean" ? ex.is_starred : false,
    eta_time: (ex?.eta_time as string | null | undefined) ?? null,
    is_do_tracking_active:
      typeof ex?.is_do_tracking_active === "boolean"
        ? ex.is_do_tracking_active
        : false,
    lb_status: lbStatus,
    lb_updated_by: lbUpdatedBy,
    lb_updated_at: lbStatus === null ? null : nowIso,
    updated_at: nowIso,
  };

  if (typeof ex?.share_token === "string" && ex.share_token.trim()) {
    payload.share_token = ex.share_token.trim();
  }
  if (typeof ex?.passenger_label === "string" && ex.passenger_label.trim()) {
    payload.passenger_label = ex.passenger_label.trim();
  }
  if (typeof ex?.flight_label === "string" && ex.flight_label.trim()) {
    payload.flight_label = ex.flight_label.trim();
  }

  const { data, error: upErr } = await supabase
    .from("services")
    .upsert(payload, { onConflict: "spreadsheet_id,service_id" })
    .select("service_id,lb_status,lb_updated_by,lb_updated_at")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ service: data });
}
