import { NextResponse } from "next/server";

import { executePlanningCronCheck } from "@/lib/planning/cron/run-check-planning";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function resolveSpreadsheetId(): string {
  return (
    process.env.PLANNING_SPREADSHEET_ID?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    DEFAULT_PLANNING_SPREADSHEET_ID
  );
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.warn(
      "[cron/check-planning] CRON_SECRET absent — refus en production."
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
 * Cron Vercel ou appel manuel : compare l’ancienne photo serveur au Sheet Google
 * et envoie les Web Push (vol retiré, assignation, alarme, fallback général).
 */
export async function GET(req: Request) {
  console.log("Tentative d'envoi push pour :", "cron-check-planning");

  if (!authorize(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const spreadsheetId = resolveSpreadsheetId();
  const result = await executePlanningCronCheck(spreadsheetId);

  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  return GET(req);
}
