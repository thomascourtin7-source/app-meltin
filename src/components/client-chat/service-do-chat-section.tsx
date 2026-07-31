"use client";

import { useState } from "react";
import { ChevronDown, MessagesSquare } from "lucide-react";

import { ClientDoChatPanel } from "@/components/client-chat/client-do-chat-panel";
import { DoShareLinkButton } from "@/components/client-chat/do-share-link-button";
import { useDoChatUnread } from "@/lib/client-chat/use-do-chat-unread";
import { useDoLinkAccess } from "@/lib/client-chat/use-do-link-access";
import { useDoTrackingActive } from "@/lib/client-chat/use-do-tracking-active";
import { cn } from "@/lib/utils";

type ServiceDoChatSectionProps = {
  spreadsheetId: string;
  serviceId: string;
  passengerLabel: string;
  variant?: "planning" | "report";
};

export function ServiceDoChatSection({
  spreadsheetId,
  serviceId,
  passengerLabel,
  variant = "planning",
}: ServiceDoChatSectionProps) {
  const [open, setOpen] = useState(false);
  const isPlanning = variant === "planning";
  const canShareLink = useDoLinkAccess();
  const { isActive: isDoTrackingActive, setActive: setDoTrackingActive } =
    useDoTrackingActive(spreadsheetId, serviceId);
  const { unreadCount } = useDoChatUnread({
    spreadsheetId,
    serviceId,
    enabled: isDoTrackingActive,
    chatOpen: open,
  });

  if (!canShareLink && !isDoTrackingActive) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-4 border-t pt-4",
        isPlanning ? "border-[#D4AF37]/25" : "border-border/60"
      )}
    >
      {canShareLink ? (
        <DoShareLinkButton
          spreadsheetId={spreadsheetId}
          serviceId={serviceId}
          passengerLabel={passengerLabel}
          variant={variant}
          className="mb-3"
          onTrackingActivated={() => setDoTrackingActive(true)}
        />
      ) : null}

      {isDoTrackingActive ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors",
              isPlanning
                ? "text-[#D4AF37] hover:bg-white/5"
                : "text-foreground hover:bg-muted/50"
            )}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="inline-flex items-center gap-2">
              <MessagesSquare className="size-4" aria-hidden />
              Chat D.O.
              {unreadCount > 0 ? (
                <span
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white"
                  aria-label={`${unreadCount} message${unreadCount > 1 ? "s" : ""} non lu${unreadCount > 1 ? "s" : ""}`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </button>
          {open ? (
            <div className="mt-3">
              <ClientDoChatPanel
                mode="agent"
                spreadsheetId={spreadsheetId}
                serviceId={serviceId}
                compact
                className={
                  isPlanning
                    ? "border-[#D4AF37]/20 bg-[#0b1220]/60 text-white [&_textarea]:border-white/15 [&_textarea]:bg-white/5 [&_textarea]:text-white"
                    : undefined
                }
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
