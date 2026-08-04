import { isAgentAdminRole } from "@/lib/auth/agent-role";
import type { AgentAuthRole } from "@/lib/auth/agent-role";
import { planningDisplayNameEquals } from "@/lib/planning/planning-team";

/** Barre de filtre rapide par agent (planning) — affichage UI, pas un contrôle de droits. */
export function isPlanningAgentFilterBarSession(opts: {
  slug?: string | null;
  displayName?: string | null;
}): boolean {
  const slug = opts.slug?.trim().toLowerCase() ?? "";
  if (
    slug === "javed" ||
    slug === "javed_ordo" ||
    slug === "thomas" ||
    slug === "karthik"
  ) {
    return true;
  }
  const displayName = opts.displayName?.trim() ?? "";
  if (!displayName) return false;
  return (
    planningDisplayNameEquals(displayName, "Javed") ||
    planningDisplayNameEquals(displayName, "JAVED ORDI") ||
    planningDisplayNameEquals(displayName, "Thomas") ||
    planningDisplayNameEquals(displayName, "Karthik")
  );
}

export function isPlanningSuperAdminSession(opts: {
  slug?: string | null;
  displayName?: string | null;
  role?: AgentAuthRole | null;
}): boolean {
  return isAgentAdminRole(opts.role);
}

export function isPlanningVipStarEditorSession(opts: {
  slug?: string | null;
  displayName?: string | null;
  role?: AgentAuthRole | null;
}): boolean {
  return isAgentAdminRole(opts.role);
}
