"use client";

import { cn } from "@/lib/utils";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0")
);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0")
);

/** Décompose une valeur `HH:MM` en heures / minutes (vide si non valide). */
export function parseHHMM(value: string | null | undefined): {
  hh: string;
  mm: string;
} {
  const m = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { hh: "", mm: "" };
  return { hh: m[1].padStart(2, "0"), mm: m[2] };
}

/**
 * Sélecteur d'heure `HH:MM` fiable cross-plateforme.
 *
 * Les `<input type="time">` natifs sont capricieux sur macOS/Safari (la roue de
 * sélection peut ne pas s'afficher). On utilise donc deux `<select>` natifs
 * (heures + minutes) : rendus par l'OS, ils sont toujours cliquables et visibles
 * sur Mac, iOS et Windows.
 */
export function TimeField({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
  selectClassName,
}: {
  value: string | null | undefined;
  /** Reçoit `HH:MM` (ou `""` si tout est remis à zéro). */
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  selectClassName?: string;
}) {
  const { hh, mm } = parseHHMM(value);

  const emit = (nextHH: string, nextMM: string) => {
    if (!nextHH && !nextMM) {
      onChange("");
      return;
    }
    onChange(`${nextHH || "00"}:${nextMM || "00"}`);
  };

  const selectBase = cn(
    "h-8 cursor-pointer appearance-none rounded bg-transparent text-center text-base font-bold leading-none tabular-nums outline-none focus-visible:outline-none disabled:cursor-not-allowed",
    selectClassName
  );

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <select
        aria-label={ariaLabel ? `${ariaLabel} (heures)` : "Heures"}
        disabled={disabled}
        value={hh}
        onChange={(e) => emit(e.currentTarget.value, mm)}
        className={selectBase}
      >
        <option value="">--</option>
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none font-bold leading-none">
        :
      </span>
      <select
        aria-label={ariaLabel ? `${ariaLabel} (minutes)` : "Minutes"}
        disabled={disabled}
        value={mm}
        onChange={(e) => emit(hh, e.currentTarget.value)}
        className={selectBase}
      >
        <option value="">--</option>
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
