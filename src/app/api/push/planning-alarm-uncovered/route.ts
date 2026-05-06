import { NextResponse } from "next/server";

import { DateTime } from "luxon";

import { broadcastAlarmUncoveredPush } from "@/lib/push/send-notification";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ZONE = "Europe/Paris";

function parisTodayYmd(): string {
  return DateTime.now().setZone(ZONE).toISODate() ?? "";
}

const DEDUPE_MS = 10 * 60 * 1000;
const dedupe = new Map<string, number>();

function pruneDedupe(): void {
  if (dedupe.size < 200) return;
  const now = Date.now();
  for (const [k, t] of dedupe) {
    if (now - t > DEDUPE_MS) dedupe.delete(k);
  }
}

function isOriginAllowed(req: Request): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!appUrl) return true;
  try {
    const allowed = new URL(appUrl).origin;
    const origin = req.headers.get("origin");
    if (!origin) return true;
    return origin === allowed;
  } catch {
    return true;
  }
}

/**
 * Cas 5 : service avec alarme sans assignation réelle — alerte globale.
 */
export async function POST(req: Request) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin non autorisée." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps attendu." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const serviceId = typeof b.serviceId === "string" ? b.serviceId.trim() : "";

  console.log("Tentative d'envoi pour le service:", serviceId);

  if (!serviceId) {
    return NextResponse.json(
      {
        error: "Champs requis : serviceId (string).",
      },
      { status: 400 }
    );
  }

  const today = parisTodayYmd();

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { data: assignment, error: aErr } = await admin
    .from("planning_assignments")
    .select("service_date")
    .eq("service_id", serviceId)
    .maybeSingle();

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const serviceDate =
    assignment &&
    typeof (assignment as { service_date?: unknown }).service_date === "string"
      ? ((assignment as { service_date: string }).service_date || "").slice(0, 10)
      : "";

  // Condition de date: push seulement si le service est pour aujourd'hui (Paris).
  if (!serviceDate || serviceDate !== today) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not-today",
      today,
      serviceDate,
    });
  }

  const { count, error: sErr } = await admin
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true });
  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }
  console.log("Nombre de destinataires trouvés:", count ?? 0);

  pruneDedupe();
  const key = `${today}\x1f${serviceId}\x1falarm-uncovered`;
  const now = Date.now();
  const last = dedupe.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "deduped",
    });
  }
  dedupe.set(key, now);

  const result = await broadcastAlarmUncoveredPush();

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
