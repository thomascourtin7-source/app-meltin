export const DEPARTURE_PAX_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

export const TAX_REFUND_OPTIONS = ["Yes", "NO"] as const;
export type TaxRefundUi = (typeof TAX_REFUND_OPTIONS)[number];

export const TAX_REFUND_SPEED_LINE_OPTIONS = [
  "Very fast",
  "Fast",
  "Queue",
] as const;

export const REFUND_TAX_BY_OPTIONS = ["Credit card", "Cash", "Mix"] as const;

export const TRAVEL_CLASS_OPTIONS = [
  "First",
  "Business",
  "Eco premium",
  "Economy",
  "Mix",
] as const;

export const END_OF_SERVICE_PLACE_OPTIONS = [
  "Lounge",
  "Duty free",
  "At the gate",
  "Boarding by agent",
] as const;

export function taxRefundBooleanFromUi(value: string): boolean | null {
  if (value === "Yes") return true;
  if (value === "NO") return false;
  return null;
}

export function taxRefundUiFromBoolean(
  value: boolean | null | undefined
): TaxRefundUi | "" {
  if (value === true) return "Yes";
  if (value === false) return "NO";
  return "";
}

export function taxRefundPdfLabel(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "NO";
  return "—";
}

/** Affiche les détails tax refund si booléen true ou si speed/by sont renseignés. */
export function taxRefundHasDetails(opts: {
  taxRefund?: boolean | null;
  taxRefundSpeed?: string | null;
  taxRefundBy?: string | null;
}): boolean {
  if (opts.taxRefund === true) return true;
  return Boolean(
    String(opts.taxRefundSpeed ?? "").trim() ||
      String(opts.taxRefundBy ?? "").trim()
  );
}

export function taxRefundPdfLabelFromReport(opts: {
  taxRefund?: boolean | null;
  taxRefundSpeed?: string | null;
  taxRefundBy?: string | null;
}): string {
  if (opts.taxRefund === true || opts.taxRefund === false) {
    return taxRefundPdfLabel(opts.taxRefund);
  }
  if (taxRefundHasDetails(opts)) return "Yes";
  return "—";
}
