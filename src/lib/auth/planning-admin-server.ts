import { NextResponse } from "next/server";

import { isAgentAdminRole } from "@/lib/auth/agent-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanningAdminAuthResult =
  | { ok: true; agentName: string }
  | { ok: false; response: NextResponse };

async function isPlanningAdminInDatabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  name: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agents_auth")
    .select("role,is_active")
    .ilike("name", name)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  if ((data as { is_active?: boolean }).is_active === false) {
    return false;
  }

  return isAgentAdminRole((data as { role?: unknown }).role);
}

/**
 * Vérifie `Authorization: Bearer <token>` : token stocké sur `agents_auth_sessions`,
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
    .from("agents_auth_sessions")
    .select("name")
    .eq("token", token)
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

  if (!isPlanningAdminInDatabase(supabase, name)) {
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
