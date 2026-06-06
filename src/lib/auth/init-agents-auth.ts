import type { SupabaseClient } from "@supabase/supabase-js";

import { isPlanningAdminDisplayName } from "@/lib/planning/planning-admins";
import {
  PLANNING_ASSIGNEE_OPTIONS,
  authAgents,
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

    const canLogin = authAgents().some((o) => o.value === option.value);
    // Le rôle admin dérive UNIQUEMENT de la liste des administrateurs (source de
    // vérité, alignée sur le contrôle front-end et serveur). Un agent interne
    // opérationnel hors de cette liste (ex. Rayane) reste un agent STANDARD.
    const role: AgentAuthSeed["role"] = isPlanningAdminDisplayName(option.label)
      ? "admin"
      : "agent";
    seeds.push({
      name: option.label,
      email: null,
      role,
      can_login: canLogin,
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
