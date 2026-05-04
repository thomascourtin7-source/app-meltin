"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";

import {
  MELTIN_AUTH_SESSION_CHANGED_EVENT,
  readPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";
import { cn } from "@/lib/utils";

export function HeaderPlanningUser() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setLabel(readPlanningAuthSession()?.displayName?.trim() || null);
    };
    sync();
    window.addEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex max-w-[11rem] items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-sm text-foreground sm:max-w-[16rem]"
      )}
      title={label ?? "Profil"}
    >
      <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {label ? (
        <span className="truncate font-medium">{label}</span>
      ) : (
        <span className="sr-only">Profil</span>
      )}
    </div>
  );
}
