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

const ASSIGNMENT_HISTORY_VIEWER_SLUGS = new Set([
  "javed",
  "javed_ordo",
  "thomas",
]);

const ASSIGNMENT_HISTORY_VIEWER_NAMES = [
  "Javed",
  "JAVED ORDI",
  "Thomas",
] as const;

/** Compare un nom de session aux libellés autorisés (casse / espaces ignorés). */
function assignmentHistoryIdentityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Historique des changements d’assignation : visible uniquement pour
 * Javed, JAVED ORDI et Thomas.
 */
export function canSeeServiceAssignmentHistory(opts: {
  slug?: string | null;
  displayName?: string | null;
}): boolean {
  const slug = opts.slug?.trim().toLowerCase() ?? "";
  if (ASSIGNMENT_HISTORY_VIEWER_SLUGS.has(slug)) return true;

  const name = assignmentHistoryIdentityKey(opts.displayName ?? "");
  if (!name) return false;
  return ASSIGNMENT_HISTORY_VIEWER_NAMES.some(
    (allowed) => assignmentHistoryIdentityKey(allowed) === name
  );
}
