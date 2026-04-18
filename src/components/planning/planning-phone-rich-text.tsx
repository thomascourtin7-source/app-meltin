"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  normalizePhoneForLinks,
  splitTextByPhoneMatches,
} from "@/lib/planning/phone-contact";
import { cn } from "@/lib/utils";

const phoneButtonClass =
  "inline max-w-full cursor-pointer rounded-sm px-0.5 text-left font-medium text-blue-600 underline decoration-blue-600 underline-offset-[3px] transition-colors hover:bg-blue-500/10 hover:text-blue-800 active:bg-blue-500/15 dark:text-blue-400 dark:decoration-blue-400 dark:hover:bg-blue-500/15 dark:hover:text-blue-200";

function PhoneContactSheetTrigger({ raw }: { raw: string }) {
  const normalized = normalizePhoneForLinks(raw);
  if (!normalized) {
    return <span className="whitespace-pre-wrap">{raw}</span>;
  }

  const labelCall = `Appeler le ${normalized.e164Display}`;

  return (
    <Sheet>
      <SheetTrigger
        nativeButton={false}
        render={
          <span
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir les options de contact pour ${normalized.e164Display}`}
            className={cn(phoneButtonClass, "touch-manipulation")}
            style={{ touchAction: "manipulation" }}
          >
            {raw}
          </span>
        }
      />
      <SheetContent
        side="bottom"
        className="z-[100] gap-0 rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        showCloseButton
      >
        <SheetHeader className="border-b border-border/50 pb-3 text-left">
          <SheetTitle className="text-lg">Contacter</SheetTitle>
          <p className="font-mono text-sm text-muted-foreground">
            {normalized.e164Display}
          </p>
        </SheetHeader>
        <nav
          className="flex flex-col gap-2 px-4 py-4"
          aria-label="Options de contact"
        >
          <a
            href={normalized.telHref}
            className={cn(
              "flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-base font-semibold text-foreground shadow-sm",
              "transition-colors hover:bg-muted active:bg-muted/80"
            )}
          >
            <span className="text-2xl leading-none" aria-hidden>
              📞
            </span>
            <span className="min-w-0 flex-1 text-left">{labelCall}</span>
          </a>
          <a
            href={normalized.waHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-base font-semibold text-foreground shadow-sm",
              "transition-colors hover:bg-muted active:bg-muted/80"
            )}
          >
            <span className="text-2xl leading-none" aria-hidden>
              💬
            </span>
            <span className="min-w-0 flex-1 text-left">WhatsApp</span>
          </a>
          <a
            href={normalized.smsHref}
            className={cn(
              "flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-base font-semibold text-foreground shadow-sm",
              "transition-colors hover:bg-muted active:bg-muted/80"
            )}
          >
            <span className="text-2xl leading-none" aria-hidden>
              ✉️
            </span>
            <span className="min-w-0 flex-1 text-left">SMS</span>
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Affiche du texte avec numéros détectés rendus en contrôle ouvrant le menu contact.
 */
export function PlanningPhoneRichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments = splitTextByPhoneMatches(text);
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((seg, i) => {
        const key = `${i}-${seg.kind}-${seg.value.slice(0, 24)}`;
        if (seg.kind === "text") {
          return <span key={key}>{seg.value}</span>;
        }
        return <PhoneContactSheetTrigger key={key} raw={seg.value} />;
      })}
    </span>
  );
}
