import { NextResponse } from "next/server";

import { requirePlanningAdminBearer } from "@/lib/auth/planning-admin-server";
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

function bodyForAssigneePush(planningDay: PlanningDay): string {
  if (planningDay === "tomorrow") {
    return "📅 DEMAIN : Tu as été assigné à un service. Ouvre le planning.";
  }
  if (planningDay === "today") {
    return "👤 Tu as été assigné à un service. Ouvre le planning.";
  }
  return "👤 Tu as été assigné à un service. Ouvre le planning.";
}

const TOMORROW_DEBOUNCE_MS = 5000;
type PendingKey = string;
const pending = new Map<
  PendingKey,
  {
    t: ReturnType<typeof setTimeout>;
    spreadsheetId: string;
    dateKey: string;
    stableRowKey: string;
    assigneeName: string;
    planningDay: PlanningDay;
    actorName: string;
    enqueuedAt: number;
  }
>();

type PlanningDay = "today" | "tomorrow" | "other";

function titleForAssigneePush(planningDay: PlanningDay): string {
  if (planningDay === "today") return "📅 Aujourd'hui : Planning mis à jour";
  if (planningDay === "tomorrow") return "📅 Demain : Planning mis à jour";
  return "📅 Planning mis à jour";
}

export async function POST(req: Request) {
  console.log("Tentative d'envoi push pour :", "planning-assignee-alert");

  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin non autorisée." }, { status: 403 });
  }

  const admin = await requirePlanningAdminBearer(req);
  if (!admin.ok) return admin.response;

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
  const actorName =
    typeof b.actorName === "string" ? b.actorName.trim() : "";
  const rawDay = b.planningDay;
  const planningDay: PlanningDay =
    rawDay === "today" || rawDay === "tomorrow" || rawDay === "other"
      ? rawDay
      : "other";

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

  const openUrl = `/planning?date=${
    planningDay === "today" ? "today" : planningDay === "tomorrow" ? "tomorrow" : dateKey
  }`;

  // Anti-spam : pour demain uniquement, on debounce 5s par cible (meilleure effort).
  if (planningDay === "tomorrow") {
    const key: PendingKey = `${spreadsheetId}\x1f${dateKey}\x1f${assigneeName.toLowerCase()}`;
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing.t);
      pending.delete(key);
    }
    const enqueuedAt = Date.now();
    const t = setTimeout(() => {
      pending.delete(key);
      void notifyPlanningAssigneeSubscribers(
        assigneeName,
        {
          title: titleForAssigneePush(planningDay),
          body: bodyForAssigneePush(planningDay),
          openUrl,
        },
        actorName ? { excludeDisplayName: actorName } : undefined
      );
    }, TOMORROW_DEBOUNCE_MS);
    pending.set(key, {
      t,
      spreadsheetId,
      dateKey,
      stableRowKey,
      assigneeName,
      planningDay,
      actorName,
      enqueuedAt,
    });
    return NextResponse.json({
      ok: true,
      skipped: false,
      queued: true,
      debounceMs: TOMORROW_DEBOUNCE_MS,
    });
  }

  const result = await notifyPlanningAssigneeSubscribers(
    assigneeName,
    {
      title: titleForAssigneePush(planningDay),
      body: bodyForAssigneePush(planningDay),
      openUrl,
    },
    actorName ? { excludeDisplayName: actorName } : undefined
  );

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
