import { NextResponse } from "next/server";

import { isPlanningAdminDisplayName } from "@/lib/planning/planning-admins";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanningAdminAuthResult =
  | { ok: true; agentName: string }
  | { ok: false; response: NextResponse };

/**
 * Vérifie `Authorization: Bearer <session_token>` : token stocké sur `agents_auth`,
 * prénom en base dans la liste des administrateurs planning.
 */
export async function requirePlanningAdminBearer(
  request: Request
): Promise<PlanningAdminAuthResult> {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = m?.[1]?.trim() ?? "";
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Session requise." }, { status: 401 }),
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      ),
    };
  }

  const { data, error } = await supabase
    .from("agents_auth")
    .select("name")
    .eq("session_token", token)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }

  const row = data as { name?: unknown } | null;
  const name =
    row && typeof row.name === "string" ? row.name.trim() : "";
  if (!name) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  if (!isPlanningAdminDisplayName(name)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Action réservée aux administrateurs." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, agentName: name };
}
