import { isAgentAdminRole } from "@/lib/auth/agent-role";
import type { AgentAuthRole } from "@/lib/auth/agent-role";

export function isDoLinkAuthorizedUser(role: AgentAuthRole | null | undefined): boolean {
  return isAgentAdminRole(role);
}
