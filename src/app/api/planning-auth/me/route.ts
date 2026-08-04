import { NextResponse } from "next/server";

import { normalizeAgentRole } from "@/lib/auth/agent-role";
import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import { requirePlanningAgentBearer } from "@/lib/auth/planning-agent-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requirePlanningAgentBearer(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase admin non configuré (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("agents_auth")
    .select("name,role,is_active")
    .ilike("name", auth.agentName)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || (data as { is_active?: boolean }).is_active === false) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const displayName =
    typeof (data as { name?: unknown }).name === "string"
      ? (data as { name: string }).name.trim()
      : auth.agentName;
  const role = normalizeAgentRole((data as { role?: unknown }).role);

  return NextResponse.json({
    displayName,
    slug: agentNameToSlug(displayName),
    role,
  });
}
