import {
  PLANNING_TEAM_REGISTER_OPTIONS,
  planningDisplayNameEquals,
} from "@/lib/planning/planning-team";

/** Slugs autorisés pour inscription / connexion (même liste que « S’enregistrer » historique). */
export const PLANNING_AUTH_ALLOWED_SLUGS: string[] =
  PLANNING_TEAM_REGISTER_OPTIONS.map((o) => o.value);

export function isAllowedPlanningAuthSlug(slug: string): boolean {
  return PLANNING_AUTH_ALLOWED_SLUGS.includes(slug);
}

export function displayNameForPlanningAuthSlug(slug: string): string | null {
  const opt = PLANNING_TEAM_REGISTER_OPTIONS.find((o) => o.value === slug);
  return opt?.label ?? null;
}

/** Slug planning pour un prénom affiché (colonne `name` dans `agents_auth`). */
export function slugFromDisplayName(displayName: string): string | null {
  const t = displayName.trim();
  if (!t) return null;
  for (const o of PLANNING_TEAM_REGISTER_OPTIONS) {
    if (planningDisplayNameEquals(o.label, t)) return o.value;
  }
  return null;
}
