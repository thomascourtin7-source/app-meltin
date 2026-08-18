"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatLbStatusMeta,
  lbStatusButtonLabel,
  type LbStatus,
} from "@/lib/planning/lb-status";

type ServiceLbStatusControlProps = {
  status: LbStatus;
  updatedBy: string | null;
  updatedAt: string | null;
  disabled?: boolean;
  onSelect: (status: LbStatus) => void | Promise<void>;
};

export function ServiceLbStatusControl({
  status,
  updatedBy,
  updatedAt,
  disabled = false,
  onSelect,
}: ServiceLbStatusControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const meta = formatLbStatusMeta(updatedBy, updatedAt);
  const isSelected = status === "large" || status === "block";

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root?.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, closeMenu]);

  const pick = (next: LbStatus) => {
    closeMenu();
    void Promise.resolve(onSelect(next)).catch((err) => {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : "Mise à jour Large/Block impossible."
      );
    });
  };

  const menuItems: { key: string; label: string; value: LbStatus; tone?: "destructive" }[] =
    isSelected
      ? [
          {
            key: "switch",
            label: status === "large" ? "Block" : "Large",
            value: status === "large" ? "block" : "large",
          },
          {
            key: "clear",
            label: "Désélectionner",
            value: null,
            tone: "destructive",
          },
        ]
      : [
          { key: "large", label: "Large", value: "large" },
          { key: "block", label: "Block", value: "block" },
        ];

  return (
    <div ref={rootRef} className="relative flex flex-col items-end gap-0.5 text-right">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={
          isSelected
            ? `Statut ${lbStatusButtonLabel(status)} — modifier`
            : "Choisir Large ou Block"
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors touch-manipulation",
          "disabled:cursor-not-allowed disabled:opacity-45",
          isSelected
            ? "border-emerald-500/60 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50"
            : "border-slate-500/50 bg-slate-900/40 text-slate-300 hover:border-slate-400/60 hover:bg-slate-800/50"
        )}
        style={{ touchAction: "manipulation" }}
        onClick={() => {
          if (disabled) return;
          setMenuOpen((o) => !o);
        }}
      >
        {lbStatusButtonLabel(status)}
        <ChevronDown
          className={cn("size-3 shrink-0 opacity-70", menuOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      {meta ? (
        <p className="max-w-[11rem] text-[10px] leading-tight text-slate-400">{meta}</p>
      ) : null}

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-[#D4AF37]/40 bg-[#0f172a] py-1 shadow-xl"
        >
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={cn(
                "block w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-white/5",
                item.tone === "destructive"
                  ? "text-red-300 hover:bg-red-950/40"
                  : "text-white"
              )}
              onClick={() => pick(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
