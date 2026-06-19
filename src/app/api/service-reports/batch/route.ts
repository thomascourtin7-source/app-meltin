import { NextResponse } from "next/server";

import {
  pecStatusFromStored,
  pecStatusToIsPec,
  type PecStatus,
} from "@/lib/planning/pec-status";
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
    ? [...new Set(
        serviceIdsRaw
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      )]
    : [];

  if (!spreadsheetId || serviceIds.length === 0) {
    return NextResponse.json(
      { error: "Champs requis manquants (spreadsheetId, serviceIds[])." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("service_reports")
    .select("service_id,is_pec,pec_status,completed_at,photo_url")
    .eq("spreadsheet_id", spreadsheetId)
    .in("service_id", serviceIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const existing = new Set<string>();
  const isPecByServiceId: Record<string, boolean> = {};
  const pecStatusByServiceId: Record<string, PecStatus> = {};
  const isCompletedByServiceId: Record<string, boolean> = {};
  const hasPhotoByServiceId: Record<string, boolean> = {};
  const photoUrlByServiceId: Record<string, string | null> = {};
  for (const id of serviceIds) {
    isPecByServiceId[id] = false;
    pecStatusByServiceId[id] = "vide";
  }
  for (const id of serviceIds) isCompletedByServiceId[id] = false;
  for (const id of serviceIds) hasPhotoByServiceId[id] = false;
  for (const id of serviceIds) photoUrlByServiceId[id] = null;

  for (const row of data ?? []) {
    const sid = (row as { service_id?: unknown }).service_id;
    const completedAt = (row as { completed_at?: unknown }).completed_at;
    const photoUrl = (row as { photo_url?: unknown }).photo_url;
    if (typeof sid !== "string") continue;
    existing.add(sid);
    const pecStatus = pecStatusFromStored(row as { pec_status?: string; is_pec?: boolean });
    pecStatusByServiceId[sid] = pecStatus;
    isPecByServiceId[sid] = pecStatusToIsPec(pecStatus);
    // Rapport « terminé » côté planning (PDF client, masquage ETA) : `completed_at` renseigné.
    // Si une colonne `is_completed` est ajoutée plus tard, l’OR ici avec la même sémantique.
    if (typeof completedAt === "string" && completedAt.trim()) {
      isCompletedByServiceId[sid] = true;
    }
    if (typeof photoUrl === "string" && photoUrl.trim()) {
      hasPhotoByServiceId[sid] = true;
      photoUrlByServiceId[sid] = photoUrl.trim();
    }
  }

  const hasReport: Record<string, boolean> = {};
  for (const id of serviceIds) hasReport[id] = existing.has(id);

  return NextResponse.json({
    hasReport,
    isPecByServiceId,
    pecStatusByServiceId,
    isCompletedByServiceId,
    hasPhotoByServiceId,
    photoUrlByServiceId,
  });
}

