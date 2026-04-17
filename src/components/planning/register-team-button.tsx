"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { subscribeChatPush } from "@/lib/push/client-subscribe-chat";
import { ensureServiceWorkerRegistered } from "@/lib/push/register-sw";
import { PLANNING_TEAM_REGISTER_OPTIONS } from "@/lib/planning/planning-team";
import { cn } from "@/lib/utils";

export const MELTIN_TEAM_REGISTER_NAME_KEY = "meltin_team_register_name";

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(MELTIN_TEAM_REGISTER_NAME_KEY)?.trim() ?? "";
}

export function RegisterTeamButton() {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(readStoredName());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onPick = useCallback(async (label: string) => {
    setMessage(null);
    setOfflineHint(false);
    setBusy(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MELTIN_TEAM_REGISTER_NAME_KEY, label);
        setName(label);
      }
      await ensureServiceWorkerRegistered();
      const r = await subscribeChatPush(label);
      if (!r.ok) {
        if (r.offline) {
          setOfflineHint(true);
          setMessage(null);
        } else {
          setMessage(r.error);
        }
      } else {
        setOfflineHint(false);
        setMessage(null);
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        className={cn("gap-1 font-normal", name && "border-primary/40")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span aria-hidden>👤</span>
        <span className="max-w-[10rem] truncate sm:max-w-[14rem]">
          {name ? name : "S'enregistrer"}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </Button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 max-h-72 min-w-[12rem] overflow-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md"
          role="listbox"
          aria-label="Choisir votre nom"
        >
          {PLANNING_TEAM_REGISTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={name === opt.label}
              className={cn(
                "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted",
                name === opt.label && "bg-muted/80"
              )}
              onClick={() => void onPick(opt.label)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      {offlineHint ? (
        <p className="absolute right-0 top-full z-50 mt-1 max-w-xs rounded border border-border/60 bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          Mode hors-ligne
        </p>
      ) : message ? (
        <p className="absolute right-0 top-full z-50 mt-1 max-w-xs rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
