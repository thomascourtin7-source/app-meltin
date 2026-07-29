import {
  DEPLANING_OPTIONS,
} from "@/lib/reports/arrival-report-options";
import { TRAVEL_CLASS_OPTIONS } from "@/lib/reports/departure-report-options";

export { DEPLANING_OPTIONS, TRAVEL_CLASS_OPTIONS };

export const VIP_LOUNGE_OPTIONS = ["Yes", "No"] as const;

export const TRANSIT_END_OF_SERVICE_OPTIONS = [
  "Self boarding end at the lounge",
  "Self boarding end at the duty free / gate",
  "Boarding by agent",
] as const;

export function vipLoungeFromStored(
  value: boolean | string | null | undefined
): (typeof VIP_LOUNGE_OPTIONS)[number] | "" {
  if (value === true || value === "Yes") return "Yes";
  if (value === false || value === "No") return "No";
  return "";
}

export function vipLoungePdfLabel(
  value: boolean | string | null | undefined
): string {
  const ui = vipLoungeFromStored(value);
  return ui || "—";
}

export function hasTransitReportPdfData(data: {
  deplanning?: string | null;
  travelClass?: string | null;
  vipLounge?: boolean | string | null;
  boardingEndOfService?: string | null;
  immigrationSecuritySpeed?: string | null;
  bagsStatus?: string | null;
}): boolean {
  return Boolean(
    String(data.deplanning ?? "").trim() ||
      String(data.travelClass ?? "").trim() ||
      vipLoungeFromStored(data.vipLounge) ||
      String(data.boardingEndOfService ?? "").trim() ||
      String(data.immigrationSecuritySpeed ?? "").trim() ||
      String(data.bagsStatus ?? "").trim()
  );
}
