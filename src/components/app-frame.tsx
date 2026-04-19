"use client";

import { usePathname } from "next/navigation";

import { Chat } from "@/components/chat/Chat";
import { SiteHeader } from "@/components/site-header";

/**
 * Hors route /chat : header + zone principale avec chat desktop en colonne.
 * Sur /chat : plein écran dédié au chat (pas de superposition Sheet).
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatPage = pathname === "/chat";

  if (isChatPage) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-h-[100dvh] w-full flex-1 flex-col">
      <SiteHeader />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden md:block md:w-80 md:shrink-0 md:border-r md:border-border/80 md:bg-background">
          <div className="sticky top-14 h-[calc(100dvh-3.5rem)]">
            <Chat variant="desktop" />
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
