import type { SupabaseClient } from "@supabase/supabase-js";

import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import {
  authAgents,
  planningDisplayNameEquals,
} from "@/lib/planning/planning-team";

/** Comptes pouvant se connecter (agents opérationnels + admins techniques). */
export const PLANNING_AGENT_IDENTITY_OPTIONS = authAgents();

/** Slugs autorisés pour inscription / connexion (catalogue statique). */
export const PLANNING_AUTH_ALLOWED_SLUGS: string[] = PLANNING_AGENT_IDENTITY_OPTIONS.map(
  (o) => o.value
);

export function isAllowedPlanningAuthSlug(slug: string): boolean {
  return PLANNING_AUTH_ALLOWED_SLUGS.includes(slug);
}

export function displayNameForPlanningAuthSlug(slug: string): string | null {
  const opt = PLANNING_AGENT_IDENTITY_OPTIONS.find((o) => o.value === slug);
  return opt?.label ?? null;
}

/** Résout un prénom depuis Supabase (agents dynamiques). */
export async function resolvePlanningAuthDisplayName(
  supabase: SupabaseClient,
  slug: string
): Promise<string | null> {
  const target = slug.trim().toLowerCase();
  if (!target) return null;

  const { data, error } = await supabase
    .from("agents_auth")
    .select("name,can_login,is_active")
    .eq("can_login", true)
    .eq("is_active", true);

  if (error || !data) return null;

  for (const row of data) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    if (agentNameToSlug(name) === target) return name;
    if (planningDisplayNameEquals(name, slug)) return name;
  }
  return null;
}

/** Slug planning pour un prénom affiché (colonne `name` dans `agents_auth`). */
export function slugFromDisplayName(displayName: string): string | null {
  const t = displayName.trim();
  if (!t) return null;
  for (const o of PLANNING_AGENT_IDENTITY_OPTIONS) {
    if (planningDisplayNameEquals(o.label, t)) return o.value;
  }
  return agentNameToSlug(t);
}
