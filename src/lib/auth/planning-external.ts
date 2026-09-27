import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import {
  isPlanningExternalAgentSlug,
  planningDisplayNameEquals,
} from "@/lib/planning/planning-team";

/** Session / profil d’un agent externe (ESCALE, etc.). */
export function isExternalPlanningAgent(opts: {
  slug?: string | null;
  displayName?: string | null;
  isExternal?: boolean | null;
}): boolean {
  if (opts.isExternal === true) return true;
  const slug = opts.slug?.trim().toLowerCase() ?? "";
  if (slug && isPlanningExternalAgentSlug(slug)) return true;
  const name = opts.displayName?.trim() ?? "";
  if (!name) return false;
  if (planningDisplayNameEquals(name, "ESCALE")) return true;
  return isPlanningExternalAgentSlug(agentNameToSlug(name));
}

export function formatEscaleAssignmentNotice(opts: {
  kind: "assigned" | "removed";
  vol?: string | null;
  rdv?: string | null;
}): string {
  const vol = (opts.vol ?? "").trim() || "—";
  if (opts.kind === "removed") {
    return `Un service vous a été retiré (Vol ${vol})`;
  }
  const rdv = (opts.rdv ?? "").trim();
  const rdvPart = rdv ? ` - RDV ${rdv}` : "";
  return `Un nouveau service vous a été assigné (Vol ${vol}${rdvPart})`;
}
