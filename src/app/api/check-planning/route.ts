import { NextResponse } from "next/server";

import { executeGlobalPlanningCronCheck } from "@/lib/planning/cron/run-check-planning";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.warn(
      "[check-planning] CRON_SECRET absent — refus en production."
    );
    return process.env.NODE_ENV === "development";
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

/**
 * Cron Vercel ou appel manuel : télécharge le Sheet, compare à la photo DB
 * (hash global + hash par ligne), envoie les Web Push.
 */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await executeGlobalPlanningCronCheck();

  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  return GET(req);
}
