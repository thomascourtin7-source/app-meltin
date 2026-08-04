"use client";

import { useAgentAuthRole } from "@/hooks/use-agent-auth-role";
import { isDoLinkAuthorizedUser } from "@/lib/client-chat/do-tracking-access";

export function useDoLinkAccess(): boolean {
  const { role } = useAgentAuthRole();
  return isDoLinkAuthorizedUser(role);
}
