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
  return hasRealAssigneeSlugs(parseAssigneeNameToSlugs(agentName));
}

/** Sync / urgence : ne pas écraser un agent réel par vide ou 🚨 seul. */
export function shouldPreserveExistingAssignee(opts: {
  existingAgentName: string | null | undefined;
  incomingSlugs: string[];
}): boolean {
  if (!hasRealAssigneeAgentName(opts.existingAgentName)) return false;
  return !hasRealAssigneeSlugs(opts.incomingSlugs);
}
