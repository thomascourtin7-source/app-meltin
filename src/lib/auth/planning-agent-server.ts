import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanningAgentAuthResult =
  | { ok: true; agentName: string }
  | { ok: false; response: NextResponse };

/** Session agent valide (tout utilisateur connecté), sans exiger le rôle admin. */
export async function requirePlanningAgentBearer(
  request: Request
): Promise<PlanningAgentAuthResult> {
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

  const name =
    data && typeof (data as { name?: unknown }).name === "string"
      ? (data as { name: string }).name.trim()
      : "";
  if (!name) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Session invalide." }, { status: 401 }),
    };
  }

  return { ok: true, agentName: name };
}
