/** Cycle PEC planning : vide → en_place → pec → vide. */
export const PEC_STATUS_VALUES = ["vide", "en_place", "pec"] as const;

export type PecStatus = (typeof PEC_STATUS_VALUES)[number];

export function isValidPecStatus(value: string): value is PecStatus {
  return (PEC_STATUS_VALUES as readonly string[]).includes(value);
}

export function normalizePecStatus(
  value: string | null | undefined
): PecStatus {
  const v = (value ?? "").trim().toLowerCase();
  if (isValidPecStatus(v)) return v;
  return "vide";
}

/** État suivant dans la boucle au clic. */
export function nextPecStatus(current: PecStatus): PecStatus {
  if (current === "vide") return "en_place";
  if (current === "en_place") return "pec";
  return "vide";
}

export function pecStatusToIsPec(status: PecStatus): boolean {
  return status === "pec";
}

/** Lit `pec_status` ou l’ancien booléen `is_pec`. */
export function pecStatusFromStored(row: {
  pec_status?: string | null;
  is_pec?: boolean | null;
}): PecStatus {
  const fromColumn = normalizePecStatus(row.pec_status);
  if (row.pec_status != null && String(row.pec_status).trim()) {
    return fromColumn;
  }
  if (row.is_pec === true) return "pec";
  return "vide";
}

export function pecStatusButtonLabel(status: PecStatus): string {
  if (status === "en_place") return "EN PLACE";
  return "PEC";
}
