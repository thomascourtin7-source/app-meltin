"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { hasPlanningAuthSession } from "@/lib/auth/planning-auth-session";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const onLoginRoute = pathname === "/login";

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const ok = hasPlanningAuthSession();
    if (onLoginRoute && ok) {
      router.replace("/planning");
      return;
    }
    if (!onLoginRoute && !ok) {
      router.replace("/login");
    }
  }, [hydrated, onLoginRoute, router]);

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

  return <>{children}</>;
}
