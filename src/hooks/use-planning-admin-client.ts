"use client";

import { useEffect, useMemo, useState } from "react";

import {
  MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
  MELTIN_TEAM_REGISTER_NAME_KEY,
} from "@/components/planning/register-team-button";
import {
  MELTIN_AUTH_SESSION_CHANGED_EVENT,
  readPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";
import { isPlanningAdminDisplayName } from "@/lib/planning/planning-admins";

export function usePlanningAdminClient(): boolean {
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const bumpListener = () => setBump((x) => x + 1);
    window.addEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, bumpListener);
    window.addEventListener(
      MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
      bumpListener
    );
    return () => {
      window.removeEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, bumpListener);
      window.removeEventListener(
        MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
        bumpListener
      );
    };
  }, []);

  return useMemo(() => {
    void bump;
    if (typeof window === "undefined") return false;
    const session = readPlanningAuthSession();
    const fromSession = session?.displayName?.trim() ?? "";
    const fromRegister =
      window.localStorage.getItem(MELTIN_TEAM_REGISTER_NAME_KEY)?.trim() ?? "";
    const name = fromSession || fromRegister;
    return isPlanningAdminDisplayName(name);
  }, [bump]);
}
