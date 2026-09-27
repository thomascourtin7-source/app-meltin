"use client";

import { useEffect, useState } from "react";

import { isExternalPlanningAgent } from "@/lib/auth/planning-external";
import {
  MELTIN_AUTH_SESSION_CHANGED_EVENT,
  readPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";

export function usePlanningExternalClient(): boolean {
  const [isExternal, setIsExternal] = useState(false);

  useEffect(() => {
    const sync = () => {
      const session = readPlanningAuthSession();
      setIsExternal(
        isExternalPlanningAgent({
          slug: session?.slug,
          displayName: session?.displayName,
          isExternal: session?.isExternal,
        })
      );
    };
    sync();
    window.addEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return isExternal;
}
