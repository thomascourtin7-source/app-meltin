import { NextResponse } from "next/server";

import { broadcastPlanningUpdate } from "@/lib/push/send-notification";

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

const TITLE = "Planning demain";
const BODY =
  "📅 Le planning de demain est disponible ! Vérifiez vos assignations.";

/** Diffusion globale : tous les abonnés push (préparation terminée). */
export async function POST(req: Request) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin non autorisée." }, { status: 403 });
  }

  const result = await broadcastPlanningUpdate({
    title: TITLE,
    body: BODY,
  });

  return NextResponse.json({ ok: true, ...result });
}
