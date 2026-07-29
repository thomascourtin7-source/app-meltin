import { DEPARTURE_PAX_OPTIONS } from "@/lib/reports/departure-report-options";

export const DEPLANING_OPTIONS = ["Block", "Large"] as const;

export const ARRIVAL_IMMIGRATION_SPEED_OPTIONS = [
  "Very fast",
  "Fast",
  "Queue",
] as const;

export const CHECKING_BAGS_OPTIONS = DEPARTURE_PAX_OPTIONS;

export const CUSTOMS_CONTROL_OPTIONS = ["Yes", "No"] as const;

export const PLACE_END_OF_SERVICE_OPTIONS = [
  "Driver on time",
  "Driver late pax waited",
  "Driver late pax took taxi/uber",
  "Taxi/uber",
  "End at the train station",
] as const;

export function yesNoBooleanFromUi(value: string): boolean | null {
  if (value === "Yes") return true;
  if (value === "No") return false;
  return null;
}

export function yesNoUiFromBoolean(
  value: boolean | null | undefined
): (typeof CUSTOMS_CONTROL_OPTIONS)[number] | "" {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

export function yesNoPdfLabel(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

/** Lecture Supabase : booléen legacy ou texte Yes/No. */
export function customsControlFromStored(
  value: boolean | string | null | undefined
): (typeof CUSTOMS_CONTROL_OPTIONS)[number] | "" {
  if (value === true || value === "Yes") return "Yes";
  if (value === false || value === "No") return "No";
  return "";
}

export function customsControlPdfLabel(
  value: boolean | string | null | undefined
): string {
  const ui = customsControlFromStored(value);
  return ui || "—";
}

export function hasArrivalReportPdfData(data: {
  deplanning?: string | null;
  travelClass?: string | null;
  immigrationSpeed?: string | null;
  checkinBags?: number | null;
  customsControl?: boolean | string | null;
  placeEndOfService?: string | null;
}): boolean {
  return Boolean(
    String(data.deplanning ?? "").trim() ||
      String(data.travelClass ?? "").trim() ||
      String(data.immigrationSpeed ?? "").trim() ||
      data.checkinBags != null ||
      customsControlFromStored(data.customsControl) ||
      String(data.placeEndOfService ?? "").trim()
  );
}
