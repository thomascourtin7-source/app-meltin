import { NextResponse } from "next/server";

import { resolveRequestUrl } from "@/lib/http/resolve-request-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ServiceReportRow = {
  id: string;
  created_at: string;
  updated_at: string;
  spreadsheet_id: string;
  service_id: string;
  service_date: string;
  service_client: string;
  service_type: string;
  service_tel: string | null;
  service_vol: string | null;
  service_rdv1: string | null;
  service_rdv2: string | null;
  service_dest_prov: string | null;
  service_driver_info: string | null;
  assignee_name: string | null;
  report_kind: string;
  deplanning: string | null;
  pax: number | null;
  service_started_at: string | null;
  travel_class: string | null;
  immigration_speed: string | null;
  checkin_bags: number | null;
  customs_control: boolean | null;
  end_of_service: string | null;
  place_end_of_service: string | null;
  comments: string | null;

  meeting_time: string | null;
  tax_refund: boolean | null;
  tax_refund_speed: string | null;
  tax_refund_by: string | null;
  checkin: boolean | null;
  immigration_security: boolean | null;
  immigration_security_speed: string | null;
  vip_lounge: boolean | null;
  boarding_end_of_service: string | null;
  transit_bags: string | null;
};

function supabaseOrError() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      ),
      supabase: null,
    } as const;
  }
  return { supabase, error: null } as const;
}

export async function GET(request: Request) {
  const { supabase, error } = supabaseOrError();
  if (error) return error;

  const url = resolveRequestUrl(request);
  const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim() || "";
  const serviceId = url.searchParams.get("serviceId")?.trim() || "";
  if (!spreadsheetId || !serviceId) {
    return NextResponse.json(
      { error: "Paramètres manquants (spreadsheetId, serviceId)." },
      { status: 400 }
    );
  }

  const { data, error: qErr } = await supabase
    .from("service_reports")
    .select("*")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  return NextResponse.json({ report: (data as ServiceReportRow | null) ?? null });
}

export async function POST(request: Request) {
  const { supabase, error } = supabaseOrError();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
  }

  const b = body as Partial<ServiceReportRow> & {
    spreadsheet_id?: unknown;
    service_id?: unknown;
  };

  const spreadsheetId =
    typeof b.spreadsheet_id === "string" ? b.spreadsheet_id.trim() : "";
  const serviceId =
    typeof b.service_id === "string" ? b.service_id.trim() : "";

  if (!spreadsheetId || !serviceId) {
    return NextResponse.json(
      { error: "Champs requis manquants (spreadsheet_id, service_id)." },
      { status: 400 }
    );
  }

  const payload = {
    ...b,
    spreadsheet_id: spreadsheetId,
    service_id: serviceId,
    updated_at: new Date().toISOString(),
  };

  const { data, error: upErr } = await supabase
    .from("service_reports")
    .upsert(payload, { onConflict: "spreadsheet_id,service_id" })
    .select("*")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ report: data as ServiceReportRow });
}

