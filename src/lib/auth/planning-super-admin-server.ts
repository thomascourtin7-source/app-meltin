import { NextResponse } from "next/server";

import { isAgentAdminRole } from "@/lib/auth/agent-role";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanningSuperAdminAuthResult =
  | { ok: true; agentName: string }
  | { ok: false; response: NextResponse };

/** Comptes avec `role = admin` dans `agents_auth`. */
export async function requirePlanningSuperAdminBearer(
  request: Request
): Promise<PlanningSuperAdminAuthResult> {
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

  const { data: agentRow, error: agentErr } = await supabase
    .from("agents_auth")
    .select("role,is_active")
    .ilike("name", name)
    .maybeSingle();

  if (agentErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: agentErr.message }, { status: 500 }),
    };
  }

  if (
    !agentRow ||
    (agentRow as { is_active?: boolean }).is_active === false ||
    !isAgentAdminRole((agentRow as { role?: unknown }).role)
  ) {
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
