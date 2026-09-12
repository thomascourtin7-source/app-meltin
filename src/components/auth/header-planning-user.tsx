"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, User } from "lucide-react";
import { useSWRConfig } from "swr";

import {
  MELTIN_AUTH_SESSION_CHANGED_EVENT,
  readPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";
import { cn } from "@/lib/utils";

const FORCE_REFRESH_EVENT = "meltin_planning_force_refresh";
const MIN_REFRESH_SPIN_MS = 700;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function HeaderPlanningUser() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [label, setLabel] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      window.dispatchEvent(new Event(FORCE_REFRESH_EVENT));
      router.refresh();
      await Promise.all([
        mutate(() => true, undefined, { revalidate: true }),
        wait(MIN_REFRESH_SPIN_MS),
      ]);
    } catch {
      await wait(MIN_REFRESH_SPIN_MS);
    } finally {
      setIsRefreshing(false);
    }
  }

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
      <button
        type="button"
        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-70"
        onClick={() => void handleRefresh()}
        disabled={isRefreshing}
        aria-label="Rafraîchir le planning"
        aria-busy={isRefreshing}
        title="Rafraîchir"
      >
        <RefreshCw
          className={cn("size-4", isRefreshing && "animate-spin")}
          aria-hidden
        />
      </button>
    </div>
  );
}
