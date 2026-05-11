import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import { planningDisplayNameEquals } from "@/lib/planning/planning-team";

/** Prénom expéditeur chat depuis la session `agents_auth` (pas les assignations planning). */
export function readChatSenderNameFromAuth(): string {
  return readPlanningAuthSession()?.displayName?.trim() ?? "";
}

export function chatSendersMatch(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  return planningDisplayNameEquals(x, y);
}

/**
 * Affichage d’un `messages.sender_name` : canonique depuis `agents_auth` si connu ;
 * valeur brute sinon (sans libellés d’assignation planning).
 */
export function formatChatSenderNameForDisplay(
  stored: string,
  registeredNames: readonly string[]
): string {
  const t = stored.trim();
  if (!t) return t;
  const canonical = registeredNames.find((n) => planningDisplayNameEquals(n, t));
  if (canonical) return canonical;
  return t;
}
