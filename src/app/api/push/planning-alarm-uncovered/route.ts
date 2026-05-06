import { NextResponse } from "next/server";

import { DateTime } from "luxon";

import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
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
  const spreadsheetId =
    typeof b.spreadsheetId === "string" ? b.spreadsheetId.trim() : "";
  const dateKey = typeof b.dateKey === "string" ? b.dateKey.trim() : "";
  const serviceId = typeof b.serviceId === "string" ? b.serviceId.trim() : "";

  if (!spreadsheetId || !dateKey || !serviceId) {
    return NextResponse.json(
      {
        error: "Champs requis : spreadsheetId (string), dateKey (string), serviceId (string).",
      },
      { status: 400 }
    );
  }

  // Condition de date: push seulement si le service est pour aujourd'hui (Paris).
  const serviceDate = normalizeCanonicalDateKey(dateKey);
  const today = parisTodayYmd();
  if (!serviceDate || serviceDate !== today) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not-today",
      today,
      serviceDate,
    });
  }

  // Historique anti-doublon (DB): 1 envoi max par service_id et par jour (Paris).
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from("sent_alarms")
      .select("spreadsheet_id")
      .eq("spreadsheet_id", spreadsheetId)
      .eq("service_identity_key", serviceId)
      .eq("sent_on", today)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already-sent",
      });
    }
  }

  pruneDedupe();
  const key = `${spreadsheetId}\x1f${today}\x1f${serviceId}\x1falarm-uncovered`;
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

  if (admin) {
    await admin.from("sent_alarms").upsert(
      {
        spreadsheet_id: spreadsheetId,
        service_identity_key: serviceId,
        sent_on: today,
        notified_at: new Date().toISOString(),
      },
      { onConflict: "spreadsheet_id,service_identity_key,sent_on" }
    );
  }

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
