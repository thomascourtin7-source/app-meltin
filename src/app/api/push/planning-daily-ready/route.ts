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

/** Diffusion globale : tous les abonnés push (préparation terminée). */
export async function POST(req: Request) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin non autorisée." }, { status: 403 });
  }

  let title = "";
  let body = "";
  let openUrl = "/";

  const ct = req.headers.get("content-type");
  if (ct?.includes("application/json")) {
    try {
      const raw: unknown = await req.json();
      if (raw && typeof raw === "object") {
        const j = raw as Record<string, unknown>;
        if (typeof j.title === "string" && j.title.trim()) title = j.title.trim();
        if (typeof j.body === "string" && j.body.trim()) body = j.body.trim();
        if (typeof j.url === "string" && j.url.trim()) openUrl = j.url.trim();
      }
    } catch {
      /* corps vide ou invalide → défauts */
    }
  }

  if (!title.trim() || !body.trim()) {
    return NextResponse.json(
      { error: "Titre et body requis (notifications génériques interdites)." },
      { status: 400 }
    );
  }

  const result = await broadcastPlanningUpdate({ title, body, openUrl });

  return NextResponse.json({ ok: true, ...result });
}
