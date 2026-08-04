"use client";

import { useAgentAuthRole } from "@/hooks/use-agent-auth-role";

export function usePlanningAdminClient(): boolean {
  const { isAdmin } = useAgentAuthRole();
  return isAdmin;
}
