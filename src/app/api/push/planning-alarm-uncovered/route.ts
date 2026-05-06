import { NextResponse } from "next/server";

import { broadcastAlarmUncoveredPush } from "@/lib/push/send-notification";

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

  console.log("ENVOI GLOBAL DÉCLENCHÉ");

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const rdv =
    body && typeof body === "object"
      ? typeof (body as { rdv?: unknown }).rdv === "string"
        ? ((body as { rdv: string }).rdv || "").trim()
        : typeof (body as { rdv1?: unknown }).rdv1 === "string"
          ? ((body as { rdv1: string }).rdv1 || "").trim()
          : null
      : null;

  const result = await broadcastAlarmUncoveredPush({ rdv });

  return NextResponse.json({ ok: true, skipped: false, ...result });
}
