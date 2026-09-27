import { NextResponse } from "next/server";

import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import { isExternalPlanningAgent } from "@/lib/auth/planning-external";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanningAgentAuthOk = {
  ok: true;
  agentName: string;
  slug: string;
  isExternal: boolean;
};

export type PlanningAgentAuthResult =
  | PlanningAgentAuthOk
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

  let isExternalFlag: boolean | null = null;
  const flagged = await supabase
    .from("agents_auth")
    .select("name,is_external,is_active")
    .ilike("name", name)
    .maybeSingle();

  const agentLookup = flagged.error
    ? await supabase
        .from("agents_auth")
        .select("name,is_active")
        .ilike("name", name)
        .maybeSingle()
    : flagged;

  const agentRow = agentLookup.data as {
    name?: unknown;
    is_active?: unknown;
    is_external?: unknown;
  } | null;

  if (agentRow && agentRow.is_active === false) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Compte introuvable." }, { status: 401 }),
    };
  }

  if (typeof agentRow?.is_external === "boolean") {
    isExternalFlag = agentRow.is_external;
  }

  const dbName =
    typeof agentRow?.name === "string" ? agentRow.name.trim() : name;

  return {
    ok: true,
    agentName: dbName,
    slug: agentNameToSlug(dbName),
    isExternal: isExternalPlanningAgent({
      slug: agentNameToSlug(dbName),
      displayName: dbName,
      isExternal: isExternalFlag,
    }),
  };
}
