import {
  PLANNING_TEAM_REGISTER_OPTIONS,
  planningDisplayNameEquals,
} from "@/lib/planning/planning-team";

/** Comptes agents réels — hors libellés métiers d’assignation (ex. Sous-traité). */
export const PLANNING_AGENT_IDENTITY_OPTIONS = PLANNING_TEAM_REGISTER_OPTIONS.filter(
  (o) => o.value !== "subcontracted"
);

/** Slugs autorisés pour inscription / connexion. */
export const PLANNING_AUTH_ALLOWED_SLUGS: string[] =
  PLANNING_AGENT_IDENTITY_OPTIONS.map((o) => o.value);

export function isAllowedPlanningAuthSlug(slug: string): boolean {
  return PLANNING_AUTH_ALLOWED_SLUGS.includes(slug);
}

export function displayNameForPlanningAuthSlug(slug: string): string | null {
  const opt = PLANNING_AGENT_IDENTITY_OPTIONS.find((o) => o.value === slug);
  return opt?.label ?? null;
}

/** Slug planning pour un prénom affiché (colonne `name` dans `agents_auth`). */
export function slugFromDisplayName(displayName: string): string | null {
  const t = displayName.trim();
  if (!t) return null;
  for (const o of PLANNING_AGENT_IDENTITY_OPTIONS) {
    if (planningDisplayNameEquals(o.label, t)) return o.value;
  }
  return null;
}
