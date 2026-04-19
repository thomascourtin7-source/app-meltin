import { NextResponse } from "next/server";

import { notifyPlanningAssigneeSubscribers } from "@/lib/push/notify-planning-assignee";

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

const TITLE = "📅 Planning mis à jour";
const BODY =
  "Votre planning a été modifié. Cliquez pour voir vos nouveaux horaires.";

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
  const stableRowKey =
    typeof b.stableRowKey === "string" ? b.stableRowKey.trim() : "";
  const assigneeName =
    typeof b.assigneeName === "string" ? b.assigneeName.trim() : "";

  if (!spreadsheetId || !dateKey || !stableRowKey || !assigneeName) {
    return NextResponse.json(
      {
        error:
          "Champs requis : spreadsheetId, dateKey, stableRowKey, assigneeName.",
      },
      { status: 400 }
    );
  }

  pruneDedupe();
  const dedupeKey = `${spreadsheetId}\x1f${dateKey}\x1f${stableRowKey}\x1f${assigneeName.toLowerCase()}`;
  const now = Date.now();
  const last = dedupe.get(dedupeKey);
  if (last !== undefined && now - last < DEDUPE_MS) {
    return NextResponse.json({ ok: true, skipped: true, reason: "deduped" });
  }
  dedupe.set(dedupeKey, now);

  const result = await notifyPlanningAssigneeSubscribers(assigneeName, {
    title: TITLE,
    body: BODY,
  });

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
