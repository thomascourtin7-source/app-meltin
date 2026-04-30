import { NextResponse } from "next/server";

import { resolveRequestUrl } from "@/lib/http/resolve-request-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ServiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  spreadsheet_id: string;
  service_id: string;
  is_pec: boolean;
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
    .from("services")
    .select("*")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  return NextResponse.json({ service: (data as ServiceRow | null) ?? null });
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

  const spreadsheetId =
    typeof (body as { spreadsheet_id?: unknown }).spreadsheet_id === "string"
      ? ((body as { spreadsheet_id: string }).spreadsheet_id || "").trim()
      : "";
  const serviceId =
    typeof (body as { service_id?: unknown }).service_id === "string"
      ? ((body as { service_id: string }).service_id || "").trim()
      : "";
  const isPecRaw = (body as { is_pec?: unknown }).is_pec;
  const isPec = typeof isPecRaw === "boolean" ? isPecRaw : null;

  if (!spreadsheetId || !serviceId || isPec === null) {
    return NextResponse.json(
      { error: "Champs requis manquants (spreadsheet_id, service_id, is_pec)." },
      { status: 400 }
    );
  }

  const payload = {
    spreadsheet_id: spreadsheetId,
    service_id: serviceId,
    is_pec: isPec,
    updated_at: new Date().toISOString(),
  };

  const { data, error: upErr } = await supabase
    .from("services")
    .upsert(payload, { onConflict: "spreadsheet_id,service_id" })
    .select("*")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ service: data as ServiceRow });
}

