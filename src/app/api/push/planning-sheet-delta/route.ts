import { NextResponse } from "next/server";

import { broadcastPlanningUpdate } from "@/lib/push/send-notification";

const DEDUPE_MS = 5 * 60 * 1000;
const dedupe = new Map<string, number>();

function pruneDedupe(): void {
  if (dedupe.size < 400) return;
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

/** Tout changement détecté côté client sur les lignes du jour (sans mention). */
export async function POST(req: Request) {
  console.log("Tentative d'envoi push pour :", "planning-sheet-delta");

  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin non autorisée." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const spreadsheetId =
    typeof b.spreadsheetId === "string" ? b.spreadsheetId.trim() : "";
  const dateKey = typeof b.dateKey === "string" ? b.dateKey.trim() : "";

  if (!spreadsheetId || !dateKey) {
    return NextResponse.json(
      { error: "spreadsheetId et dateKey requis." },
      { status: 400 }
    );
  }

  pruneDedupe();
  const key = `${spreadsheetId}\x1f${dateKey}\x1fdelta`;
  const now = Date.now();
  const last = dedupe.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) {
    return NextResponse.json({ ok: true, skipped: true, reason: "deduped" });
  }
  dedupe.set(key, now);

  const result = await broadcastPlanningUpdate({
    title: "📅 Planning",
    body: "Le planning a été modifié",
    openUrl: "/",
  });

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
