"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useClientDoChat } from "@/lib/client-chat/use-client-do-chat";

type ClientDoChatPanelProps = {
  mode: "public" | "agent";
  locale?: "en" | "fr";
  shareToken?: string;
  spreadsheetId?: string;
  serviceId?: string;
  className?: string;
  compact?: boolean;
};

const COPY = {
  en: {
    title: "Live Chat with Greeter",
    loading: "Loading…",
    empty: "No messages yet.",
    placeholder: "Write a message to your greeter...",
    replyPlaceholder: "Reply to the orderer…",
    sendError: "Unable to send.",
    clientSender: "CLIENT / ORDERER",
  },
  fr: {
    title: "Chat Donneur d'ordre",
    loading: "Chargement…",
    empty: "Aucun message pour le moment.",
    placeholder: "Écrire au greeter…",
    replyPlaceholder: "Répondre au donneur d'ordre…",
    sendError: "Envoi impossible.",
    clientSender: "Donneur d'ordre",
  },
} as const;

const AGENT_QUICK_REPLIES = [
  "I have a lot of hand luggages to carry, i will respond to your messages shortly.",
  "We are at the passport control, everything is going fine.",
  "We are at the belt to take the checked bags.",
  "Client with the driver, everything went well.",
] as const;

function formatMessageTime(iso: string, locale: "en" | "fr"): string {
  try {
    return new Date(iso).toLocaleTimeString(locale === "en" ? "en-GB" : "fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ClientDoChatPanel({
  mode,
  locale = "fr",
  shareToken,
  spreadsheetId,
  serviceId,
  className,
  compact = false,
}: ClientDoChatPanelProps) {
  const t = COPY[locale];
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, loading, error, sending, sendMessage } = useClientDoChat({
    mode,
    shareToken,
    spreadsheetId,
    serviceId,
    clientSenderName: locale === "en" ? "CLIENT / ORDERER" : undefined,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    try {
      await sendMessage(text);
    } catch (e) {
      setDraft(text);
      window.alert(e instanceof Error ? e.message : t.sendError);
    }
  };

  const handleQuickReply = async (text: string) => {
    if (sending) return;
    try {
      await sendMessage(text);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t.sendError);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/80",
        compact ? "min-h-[220px]" : "min-h-[320px]",
        className
      )}
    >
      <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t.title}
      </div>

      <div
        className={cn(
          "flex-1 space-y-2 overflow-y-auto px-3 py-3",
          compact ? "max-h-48" : "max-h-80"
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.loading}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t.empty}
          </p>
        ) : (
          messages.map((m) => {
            const isClient = m.sender_type === "client";
            const senderLabel = isClient ? t.clientSender : m.sender_name;
            return (
              <div
                key={m.id}
                className={cn("flex", isClient ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    isClient
                      ? "rounded-bl-md bg-muted text-foreground"
                      : "rounded-br-md bg-[#0f172a] text-white"
                  )}
                >
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {senderLabel}
                    <span className="ml-2 font-normal normal-case opacity-60">
                      {formatMessageTime(m.created_at, locale)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="px-3 pb-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-t border-border/50 p-3">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mode === "public" ? t.placeholder : t.replyPlaceholder
            }
            rows={compact ? 1 : 2}
            className="min-h-[40px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            disabled={!draft.trim() || sending}
            onClick={() => void handleSend()}
            aria-label="Send"
            className="shrink-0 self-end"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>

        {mode === "agent" ? (
          <div
            className={cn(
              "mt-2.5 flex flex-wrap gap-2",
              compact && "max-h-28 overflow-y-auto sm:max-h-none"
            )}
            role="group"
            aria-label="Quick replies"
          >
            {AGENT_QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                type="button"
                data-quick-reply
                disabled={sending}
                onClick={() => void handleQuickReply(reply)}
                className={cn(
                  "max-w-full rounded-full border px-3 py-1.5 text-left text-[11px] leading-snug transition-colors",
                  "border-current/20 bg-current/5 text-inherit",
                  "hover:border-[#D4AF37]/50 hover:bg-current/10",
                  "active:scale-[0.98] active:bg-current/15",
                  "disabled:pointer-events-none disabled:opacity-45",
                  "sm:max-w-[calc(50%-0.25rem)]"
                )}
              >
                {reply}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
