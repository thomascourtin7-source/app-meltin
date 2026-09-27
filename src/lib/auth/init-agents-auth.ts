import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PLANNING_ASSIGNEE_OPTIONS,
  authAgents,
  isPlanningExternalAgentSlug,
} from "@/lib/planning/planning-team";

type AgentAuthSeed = {
  name: string;
  email: string | null;
  role: "agent" | "admin";
  can_login: boolean;
  password: string | null;
  is_external: boolean;
};

function buildAgentAuthSeeds(): AgentAuthSeed[] {
  const seeds: AgentAuthSeed[] = [];

  for (const option of PLANNING_ASSIGNEE_OPTIONS) {
    if (option.value === "__none__" || option.value === "emoji_alert") continue;

    const canLogin = authAgents().some((o) => o.value === option.value);
    // Le rôle admin dérive UNIQUEMENT de la liste des administrateurs (source de
    // vérité, alignée sur le contrôle front-end et serveur). Un agent interne
    // opérationnel hors de cette liste (ex. Rayane) reste un agent STANDARD.
    const role: AgentAuthSeed["role"] = "agent";
    const isExternal = isPlanningExternalAgentSlug(option.value);
    seeds.push({
      name: option.label,
      email: null,
      role,
      can_login: canLogin,
      password: null,
      is_external: isExternal,
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
      .select("name,password,is_active")
      .eq("name", seed.name)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (existing) {
      const existingRow = existing as {
        name?: string;
        password?: unknown;
        is_active?: boolean | null;
      };
      if (existingRow.is_active === false) {
        continue;
      }

      const payload: Record<string, unknown> = {
        email: seed.email,
        can_login: seed.can_login,
        is_external: seed.is_external,
        ...(seed.can_login ? {} : { password: null }),
      };
      const { error } = await supabase
        .from("agents_auth")
        .update(payload)
        .eq("name", seed.name);

      if (error && /is_external/i.test(error.message)) {
        delete payload.is_external;
        const retry = await supabase
          .from("agents_auth")
          .update(payload)
          .eq("name", seed.name);
        if (retry.error) {
          throw new Error(retry.error.message);
        }
      } else if (error) {
        throw new Error(error.message);
      }
      continue;
    }

    const insertPayload: Record<string, unknown> = {
      name: seed.name,
      email: seed.email,
      role: seed.role,
      can_login: seed.can_login,
      password: seed.password,
      is_external: seed.is_external,
    };
    const { error } = await supabase.from("agents_auth").insert(insertPayload);

    if (error && /is_external/i.test(error.message)) {
      delete insertPayload.is_external;
      const retry = await supabase.from("agents_auth").insert(insertPayload);
      if (retry.error) {
        throw new Error(retry.error.message);
      }
    } else if (error) {
      throw new Error(error.message);
    }
  }
}
