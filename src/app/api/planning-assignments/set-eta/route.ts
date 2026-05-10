import { NextResponse } from "next/server";

import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Upsert ETA sur `planning_assignments` (même ligne que les agents), sans notifier. */
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

  const serviceId =
    typeof (body as { serviceId?: unknown }).serviceId === "string"
      ? ((body as { serviceId: string }).serviceId || "").trim()
      : "";
  const serviceDateRaw =
    typeof (body as { serviceDate?: unknown }).serviceDate === "string"
      ? ((body as { serviceDate: string }).serviceDate || "").trim()
      : "";
  const etaRaw = (body as { eta_time?: unknown }).eta_time;
  const etaTime =
    etaRaw === null || etaRaw === undefined
      ? null
      : typeof etaRaw === "string"
        ? etaRaw.trim() || null
        : null;

  if (!serviceId) {
    return NextResponse.json(
      { error: "Champ requis manquant : serviceId." },
      { status: 400 }
    );
  }

  if (etaTime !== null && !/^\d{2}:\d{2}$/.test(etaTime)) {
    return NextResponse.json(
      { error: "eta_time doit être au format HH:mm." },
      { status: 400 }
    );
  }

  const normalizedDate = normalizeCanonicalDateKey(serviceDateRaw).slice(0, 10);

  const { data: existing, error: readErr } = await supabase
    .from("planning_assignments")
    .select("agent_name,service_date,eta_time")
    .eq("service_id", serviceId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const serviceDate = (() => {
    try {
      if (serviceDateRaw) {
        return new Date(normalizedDate).toISOString().split("T")[0];
      }
      const fromRow = (existing as { service_date?: string | null } | null)
        ?.service_date;
      if (
        typeof fromRow === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(fromRow.trim())
      ) {
        return fromRow.trim().slice(0, 10);
      }
      return null;
    } catch {
      return serviceDateRaw ? normalizedDate : null;
    }
  })();

  if (!serviceDate) {
    return NextResponse.json(
      { error: "Champ serviceDate manquant ou invalide." },
      { status: 400 }
    );
  }

  const payload = {
    service_id: serviceId,
    service_date: serviceDate,
    agent_name: (existing as { agent_name?: string | null } | null)?.agent_name ?? null,
    eta_time: etaTime,
    updated_at: new Date().toISOString(),
  };

  const { data, error: upErr } = await supabase
    .from("planning_assignments")
    .upsert(payload, { onConflict: "service_id" })
    .select("service_id,agent_name,eta_time")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assignment: data });
}
