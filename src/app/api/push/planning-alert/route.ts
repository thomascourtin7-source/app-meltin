import { NextResponse } from "next/server";

import { broadcastPlanningUpdate } from "@/lib/push/send-notification";

const DEDUPE_MS = 5 * 60 * 1000;
const dedupe = new Map<string, number>();

function pruneDedupe(): void {
  if (dedupe.size < 300) return;
  const now = Date.now();
  for (const [k, t] of dedupe) {
    if (now - t > DEDUPE_MS) dedupe.delete(k);
  }
}

function dedupeKey(
  spreadsheetId: string,
  dateKey: string,
  newIdentityKeys: string[]
): string {
  return `${spreadsheetId}\x1f${dateKey}\x1f${[...newIdentityKeys].sort().join("\x1e")}`;
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

const NOTIFICATION_TITLE = "🚨 NOUVEAU SERVICE DETECTÉ";
const NOTIFICATION_BODY =
  "Un nouveau transport a été ajouté au planning. Clique pour voir.";

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
  const newIdentityKeys = Array.isArray(b.newIdentityKeys)
    ? b.newIdentityKeys.filter(
        (x): x is string => typeof x === "string" && x.length > 0
      )
    : [];

  if (!spreadsheetId || !dateKey || newIdentityKeys.length === 0) {
    return NextResponse.json(
      {
        error:
          "Champs requis : spreadsheetId (string), dateKey (string), newIdentityKeys (string[] non vide).",
      },
      { status: 400 }
    );
  }

  pruneDedupe();
  const key = dedupeKey(spreadsheetId, dateKey, newIdentityKeys);
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

  const result = await broadcastPlanningUpdate({
    title: NOTIFICATION_TITLE,
    body: NOTIFICATION_BODY,
  });

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
