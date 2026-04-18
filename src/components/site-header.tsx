import Link from "next/link";
import { CalendarDays, Settings2 } from "lucide-react";

import { ChatNavButton } from "@/components/chat/chat-nav-button";
import { RegisterTeamButton } from "@/components/planning/register-team-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/planning"
          className="flex min-w-0 items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <span className="truncate text-base sm:text-lg">Meltin Planning</span>
        </Link>
        <div className="flex items-center gap-2">
          <RegisterTeamButton />
          <ChatNavButton />
          <Link
            href="/configuration"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex gap-1.5"
            )}
          >
            <Settings2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">Configuration</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
