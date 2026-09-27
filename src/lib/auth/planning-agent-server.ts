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

  const agentRow = agentLookup.data;

  if (agentRow && (agentRow as { is_active?: boolean }).is_active === false) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Compte introuvable." }, { status: 401 }),
    };
  }

  if (
    agentRow &&
    typeof (agentRow as { is_external?: unknown }).is_external === "boolean"
  ) {
    isExternalFlag = (agentRow as { is_external: boolean }).is_external;
  }

  const dbName =
    agentRow && typeof (agentRow as { name?: unknown }).name === "string"
      ? (agentRow as { name: string }).name.trim()
      : name;

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
