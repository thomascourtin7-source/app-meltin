import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
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
    typeof (body as { spreadsheetId?: unknown }).spreadsheetId === "string"
      ? ((body as { spreadsheetId: string }).spreadsheetId || "").trim()
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
    return NextResponse.json(
      { error: "Champs requis manquants (spreadsheetId, serviceIds[])." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("services")
    .select("service_id,is_pec")
    .eq("spreadsheet_id", spreadsheetId)
    .in("service_id", serviceIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const isPecByServiceId: Record<string, boolean> = {};
  for (const id of serviceIds) isPecByServiceId[id] = false;
  for (const row of data ?? []) {
    const sid = (row as { service_id?: unknown }).service_id;
    const isPec = (row as { is_pec?: unknown }).is_pec;
    if (typeof sid === "string" && typeof isPec === "boolean") {
      isPecByServiceId[sid] = isPec;
    }
  }

  return NextResponse.json({ isPecByServiceId });
}

