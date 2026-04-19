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

type PlanningDay = "today" | "tomorrow" | "other";

function titleRemoved(day: PlanningDay): string {
  if (day === "today") return "❌ Vol retiré (Aujourd'hui)";
  if (day === "tomorrow") return "❌ Vol retiré (Demain)";
  return "❌ Vol retiré";
}

const BODY_REMOVED =
  "Un service vous a été retiré du planning. Vérifiez vos horaires.";

export async function POST(req: Request) {
  console.log("Tentative d'envoi push pour :", "planning-row-removed");

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
  const stableRowKey =
    typeof b.stableRowKey === "string" ? b.stableRowKey.trim() : "";
  const assigneeName =
    typeof b.assigneeName === "string" ? b.assigneeName.trim() : "";
  const planningDay = b.planningDay as PlanningDay | undefined;

  if (!spreadsheetId || !dateKey || !stableRowKey || !assigneeName) {
    return NextResponse.json(
      {
        error:
          "Champs requis : spreadsheetId, dateKey, stableRowKey, assigneeName.",
      },
      { status: 400 }
    );
  }

  const day: PlanningDay =
    planningDay === "today" || planningDay === "tomorrow"
      ? planningDay
      : "other";

  pruneDedupe();
  const dedupeKey = `${spreadsheetId}\x1f${dateKey}\x1f${stableRowKey}\x1f${assigneeName.toLowerCase()}\x1fremoved`;
  const now = Date.now();
  const last = dedupe.get(dedupeKey);
  if (last !== undefined && now - last < DEDUPE_MS) {
    return NextResponse.json({ ok: true, skipped: true, reason: "deduped" });
  }
  dedupe.set(dedupeKey, now);

  const result = await notifyPlanningAssigneeSubscribers(assigneeName, {
    title: titleRemoved(day),
    body: BODY_REMOVED,
  });

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
