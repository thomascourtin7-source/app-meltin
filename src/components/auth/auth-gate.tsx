"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { hasPlanningAuthSession, readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import { isExternalPlanningAgent } from "@/lib/auth/planning-external";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const onLoginRoute = pathname === "/login";
  const isPublicTrackRoute = pathname.startsWith("/track/");
  const externalBlocked =
    pathname === "/chat" ||
    pathname === "/stats" ||
    pathname === "/planning-ia" ||
    pathname.startsWith("/planning-ia/");

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || isPublicTrackRoute) return;
    const ok = hasPlanningAuthSession();
    if (onLoginRoute && ok) {
      router.replace("/planning");
      return;
    }
    if (!onLoginRoute && !ok) {
      router.replace("/login");
      return;
    }
    if (
      ok &&
      externalBlocked &&
      isExternalPlanningAgent({
        slug: readPlanningAuthSession()?.slug,
        displayName: readPlanningAuthSession()?.displayName,
        isExternal: readPlanningAuthSession()?.isExternal,
      })
    ) {
      router.replace("/planning");
    }
  }, [hydrated, isPublicTrackRoute, onLoginRoute, externalBlocked, router]);

  if (isPublicTrackRoute) {
    return <>{children}</>;
  }

  if (!hydrated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (onLoginRoute && hasPlanningAuthSession()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <span className="text-sm">Redirection…</span>
      </div>
    );
  }

  if (!onLoginRoute && !hasPlanningAuthSession()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <span className="text-sm">Redirection…</span>
      </div>
    );
  }

  if (
    externalBlocked &&
    isExternalPlanningAgent({
      slug: readPlanningAuthSession()?.slug,
      displayName: readPlanningAuthSession()?.displayName,
      isExternal: readPlanningAuthSession()?.isExternal,
    })
  ) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <span className="text-sm">Redirection…</span>
      </div>
    );
  }

  return <>{children}</>;
}
