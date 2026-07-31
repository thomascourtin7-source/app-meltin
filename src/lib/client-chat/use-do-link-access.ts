"use client";

import { useEffect, useState } from "react";

import { isDoLinkAuthorizedUser } from "@/lib/client-chat/do-tracking-access";
import {
  readPlanningAuthSession,
  subscribePlanningAuthSession,
} from "@/lib/auth/planning-auth-session";

export function useDoLinkAccess(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAllowed(
        isDoLinkAuthorizedUser(readPlanningAuthSession()?.displayName)
      );
    };
    sync();
    return subscribePlanningAuthSession(sync);
  }, []);

  return allowed;
}
