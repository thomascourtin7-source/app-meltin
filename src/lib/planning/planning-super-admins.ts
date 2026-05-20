import { planningDisplayNameEquals } from "@/lib/planning/planning-team";

/** Slugs session : Javed (opérationnel) + JAVED ORDI (admin technique). */
export const PLANNING_SUPER_ADMIN_SLUGS = ["javed", "javed_ordo"] as const;

export function isPlanningSuperAdminSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (PLANNING_SUPER_ADMIN_SLUGS as readonly string[]).includes(s);
}

export function isPlanningSuperAdminDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return (
    planningDisplayNameEquals(t, "Javed") ||
    planningDisplayNameEquals(t, "JAVED ORDI")
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
