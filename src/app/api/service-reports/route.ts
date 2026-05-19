import { NextResponse } from "next/server";

import { resolveRequestUrl } from "@/lib/http/resolve-request-url";
import { isValidBagsStatus } from "@/lib/reports/transit-bags-status";
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
  bags_status: string | null;
  is_pec: boolean | null;
  completed_at: string | null;
  photo_url: string | null;
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

  const reportKind =
    typeof b.report_kind === "string" ? b.report_kind.trim().toLowerCase() : "";
  const isCompleting = b.completed_at != null && b.completed_at !== "";
  const bagsStatusRaw =
    typeof b.bags_status === "string" ? b.bags_status.trim() : "";

  if (isCompleting && reportKind === "transit") {
    if (!isValidBagsStatus(bagsStatusRaw)) {
      return NextResponse.json(
        {
          error:
            "Statut bagages requis pour un rapport Transit (bags_status).",
        },
        { status: 400 }
      );
    }
  }

  const payload = {
    ...b,
    spreadsheet_id: spreadsheetId,
    service_id: serviceId,
    updated_at: new Date().toISOString(),
    bags_status:
      reportKind === "transit"
        ? isValidBagsStatus(bagsStatusRaw)
          ? bagsStatusRaw
          : null
        : null,
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

const SERVICE_PHOTOS_BUCKET = "service-photos";

function objectPathInBucketFromPublicUrl(
  publicUrl: string,
  bucket: string
): string | null {
  const trimmed = publicUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const idx = u.pathname.indexOf(`/${bucket}/`);
    if (idx === -1) return null;
    const raw = u.pathname.slice(idx + bucket.length + 2);
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    const marker = `${bucket}/`;
    const i = trimmed.indexOf(marker);
    if (i === -1) return null;
    const tail = trimmed.slice(i + marker.length).split(/[?#]/)[0];
    return tail ? decodeURIComponent(tail) : null;
  }
}

export async function DELETE(request: Request) {
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

  const b = body as {
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

  const { data: row, error: selErr } = await supabase
    .from("service_reports")
    .select("photo_url")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  const photoUrl =
    typeof (row as { photo_url?: unknown }).photo_url === "string"
      ? (row as { photo_url: string }).photo_url.trim()
      : "";

  const { error: delErr } = await supabase
    .from("service_reports")
    .delete()
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (photoUrl) {
    const objectPath = objectPathInBucketFromPublicUrl(
      photoUrl,
      SERVICE_PHOTOS_BUCKET
    );
    if (objectPath) {
      const { error: rmErr } = await supabase.storage
        .from(SERVICE_PHOTOS_BUCKET)
        .remove([objectPath]);
      if (rmErr) {
        console.error("[service-reports DELETE] storage remove", rmErr);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

