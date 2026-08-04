"use client";

import { useCallback, useEffect, useState } from "react";

import { isAgentAdminRole, normalizeAgentRole, type AgentAuthRole } from "@/lib/auth/agent-role";
import {
  MELTIN_AUTH_SESSION_CHANGED_EVENT,
  patchPlanningAuthSessionRole,
  readPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";

type RoleState = {
  role: AgentAuthRole | null;
  isAdmin: boolean;
  loading: boolean;
};

export function useAgentAuthRole(): RoleState {
  const [state, setState] = useState<RoleState>({
    role: null,
    isAdmin: false,
    loading: true,
  });

  const refresh = useCallback(async () => {
    const session = readPlanningAuthSession();
    if (!session?.token) {
      setState({ role: null, isAdmin: false, loading: false });
      return;
    }

    if (session.role) {
      const role = normalizeAgentRole(session.role);
      setState({ role, isAdmin: isAgentAdminRole(role), loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/planning-auth/me", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const json = (await res.json()) as { role?: unknown; error?: string };
      if (!res.ok) {
        setState({ role: "agent", isAdmin: false, loading: false });
        return;
      }
      const role = normalizeAgentRole(json.role);
      patchPlanningAuthSessionRole(role);
      setState({ role, isAdmin: isAgentAdminRole(role), loading: false });
    } catch {
      setState({ role: "agent", isAdmin: false, loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, onChange);
  }, [refresh]);

  return state;
}
