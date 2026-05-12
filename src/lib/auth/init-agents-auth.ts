import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PLANNING_ASSIGNEE_OPTIONS,
  isPlanningAssignmentOnlySlug,
  isPlanningInternalAgentSlug,
} from "@/lib/planning/planning-team";

type AgentAuthSeed = {
  name: string;
  email: string | null;
  role: "agent" | "admin";
  can_login: boolean;
  password: string | null;
};

function buildAgentAuthSeeds(): AgentAuthSeed[] {
  const seeds: AgentAuthSeed[] = [];

  for (const option of PLANNING_ASSIGNEE_OPTIONS) {
    if (option.value === "__none__" || option.value === "emoji_alert") continue;

    const assignmentOnly = isPlanningAssignmentOnlySlug(option.value);
    const internalAgent = isPlanningInternalAgentSlug(option.value);
    seeds.push({
      name: option.label,
      email: null,
      role: assignmentOnly ? "agent" : internalAgent ? "admin" : "agent",
      can_login: !assignmentOnly,
      password: null,
    });
  }

  return seeds;
}

/** Synchronise le catalogue agents (sous-traitants sans connexion, rôles admin). */
export async function initAgentsAuth(supabase: SupabaseClient): Promise<void> {
  const { error: deleteError } = await supabase
    .from("agents_auth")
    .delete()
    .in("name", ["Sous-traité", "Sous-traite", "subcontracted"]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  for (const seed of buildAgentAuthSeeds()) {
    const { data: existing, error: fetchError } = await supabase
      .from("agents_auth")
      .select("name,password")
      .eq("name", seed.name)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (existing) {
      const { error } = await supabase
        .from("agents_auth")
        .update({
          email: seed.email,
          role: seed.role,
          can_login: seed.can_login,
          ...(seed.can_login ? {} : { password: null }),
        })
        .eq("name", seed.name);

      if (error) {
        throw new Error(error.message);
      }
      continue;
    }

    const { error } = await supabase.from("agents_auth").insert({
      name: seed.name,
      email: seed.email,
      role: seed.role,
      can_login: seed.can_login,
      password: seed.password,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}
