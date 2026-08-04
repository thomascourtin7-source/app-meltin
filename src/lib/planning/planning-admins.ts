import { isAgentAdminRole } from "@/lib/auth/agent-role";

/** Droits administrateur basés sur `agents_auth.role`. */
export function isPlanningAdminRole(role: unknown): boolean {
  return isAgentAdminRole(role);
}

/** @deprecated Utiliser {@link isPlanningAdminRole} avec le rôle en session / base. */
export function isPlanningAdminDisplayName(_name: string): boolean {
  return false;
}
