import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  isUrgentAssignee,
  parseAssigneeNameToSlugs,
} from "@/lib/planning/planning-team";

export function hasRealAssigneeSlugs(slugs: string[]): boolean {
  return slugs.some(
    (s) => s !== DEFAULT_PLANNING_ASSIGNEE_SLUG && !isUrgentAssignee(s)
  );
}

export function hasRealAssigneeAgentName(agentName: string | null | undefined): boolean {
  if (!agentName?.trim()) return false;
  const trimmed = agentName.trim();
  if (/^non assign[ée]$/i.test(trimmed)) return false;
  if (trimmed === "null" || trimmed === "__none__") return false;
  return hasRealAssigneeSlugs(parseAssigneeNameToSlugs(agentName));
}

/** Valeur UI / API signifiant « plus d’agent » (null, vide, Non assigné). */
export function isExplicitUnassignedInput(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return true;
    if (/^non assign[ée]$/i.test(t)) return true;
    if (t === "null" || t === "__none__" || t === "none") return true;
    return false;
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return true;
    return raw.every(
      (x) =>
        x == null ||
        (typeof x === "string" &&
          (x.trim() === "" ||
            x.trim() === "__none__" ||
            /^non assign[ée]$/i.test(x.trim())))
    );
  }
  return false;
}

/** Sync / urgence : ne pas écraser un agent réel par vide ou 🚨 seul. */
export function shouldPreserveExistingAssignee(opts: {
  existingAgentName: string | null | undefined;
  incomingSlugs: string[];
}): boolean {
  if (!hasRealAssigneeAgentName(opts.existingAgentName)) return false;
  return !hasRealAssigneeSlugs(opts.incomingSlugs);
}
