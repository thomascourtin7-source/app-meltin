import { planningDisplayNameEquals } from "@/lib/planning/planning-team";

/** Slugs session : Javed, JAVED ORDI, Thomas (supervision globale). */
export const PLANNING_SUPER_ADMIN_SLUGS = [
  "javed",
  "javed_ordo",
  "thomas",
] as const;

export function isPlanningSuperAdminSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (PLANNING_SUPER_ADMIN_SLUGS as readonly string[]).includes(s);
}

export function isPlanningSuperAdminDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return (
    planningDisplayNameEquals(t, "Javed") ||
    planningDisplayNameEquals(t, "JAVED ORDI") ||
    planningDisplayNameEquals(t, "Thomas")
  );
}

/**
 * Admin + : contourne les verrous « réservé à l’agent assigné » (PEC, photo, rapport, ETA départ…).
 */
export function isPlanningSuperAdminSession(opts: {
  slug?: string | null;
  displayName?: string | null;
}): boolean {
  const slug = opts.slug?.trim().toLowerCase() ?? "";
  if (slug && isPlanningSuperAdminSlug(slug)) return true;
  const displayName = opts.displayName?.trim() ?? "";
  if (displayName && isPlanningSuperAdminDisplayName(displayName)) return true;
  return false;
}

/** Comptes autorisés à activer / désactiver l’étoile VIP (`is_starred`). */
export const PLANNING_VIP_STAR_EDITOR_SLUGS = [
  "javed",
  "javed_ordo",
  "thomas",
] as const;

export function isPlanningVipStarEditorSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (PLANNING_VIP_STAR_EDITOR_SLUGS as readonly string[]).includes(s);
}

export function isPlanningVipStarEditorDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return (
    planningDisplayNameEquals(t, "Javed") ||
    planningDisplayNameEquals(t, "JAVED ORDI") ||
    planningDisplayNameEquals(t, "Thomas")
  );
}

export function isPlanningVipStarEditorSession(opts: {
  slug?: string | null;
  displayName?: string | null;
}): boolean {
  const slug = opts.slug?.trim().toLowerCase() ?? "";
  if (slug && isPlanningVipStarEditorSlug(slug)) return true;
  const displayName = opts.displayName?.trim() ?? "";
  if (displayName && isPlanningVipStarEditorDisplayName(displayName)) return true;
  return false;
}

/** Barre de filtre rapide par agent (planning) : Javed, JAVED ORDI, Thomas. */
export const PLANNING_AGENT_FILTER_BAR_SLUGS = [
  "javed",
  "javed_ordo",
  "thomas",
] as const;

export function isPlanningAgentFilterBarSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (PLANNING_AGENT_FILTER_BAR_SLUGS as readonly string[]).includes(s);
}

export function isPlanningAgentFilterBarDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return (
    planningDisplayNameEquals(t, "Javed") ||
    planningDisplayNameEquals(t, "JAVED ORDI") ||
    planningDisplayNameEquals(t, "Thomas")
  );
}

export function isPlanningAgentFilterBarSession(opts: {
  slug?: string | null;
  displayName?: string | null;
}): boolean {
  const slug = opts.slug?.trim().toLowerCase() ?? "";
  if (slug && isPlanningAgentFilterBarSlug(slug)) return true;
  const displayName = opts.displayName?.trim() ?? "";
  if (displayName && isPlanningAgentFilterBarDisplayName(displayName)) return true;
  return false;
}
