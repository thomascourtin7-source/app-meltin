"use client";

import { useAgentAuthRole } from "@/hooks/use-agent-auth-role";

/** Droits étendus planning (contournement verrous assignation, gestion agents, etc.). */
export function usePlanningSuperAdminClient(): boolean {
  const { isAdmin } = useAgentAuthRole();
  return isAdmin;
}
