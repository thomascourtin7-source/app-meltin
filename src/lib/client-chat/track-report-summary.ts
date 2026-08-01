import { customsControlPdfLabel } from "@/lib/reports/arrival-report-options";
import {
  taxRefundHasDetails,
  taxRefundPdfLabelFromReport,
} from "@/lib/reports/departure-report-options";
import { resolveServiceReportKind } from "@/lib/planning/service-kind";
import { bagsStatusDisplayLabel } from "@/lib/reports/transit-bags-status";
import { vipLoungePdfLabel } from "@/lib/reports/transit-report-options";

export type TrackReportField = { label: string; value: string };

export type TrackMissionReportSummary = {
  reportKind: "arrival" | "departure" | "transit";
  fields: TrackReportField[];
};

export type TrackReportRowSlice = {
  service_type?: string | null;
  report_kind?: string | null;
  completed_at?: string | null;
  deplanning?: string | null;
  pax?: number | null;
  travel_class?: string | null;
  immigration_speed?: string | null;
  checkin_bags?: number | null;
  customs_control?: boolean | string | null;
  place_end_of_service?: string | null;
  comments?: string | null;
  no_show?: boolean | null;
  no_checked_bags?: boolean | null;
  tax_refund?: boolean | null;
  tax_refund_speed?: string | null;
  tax_refund_by?: string | null;
  immigration_security_speed?: string | null;
  vip_lounge?: boolean | string | null;
  boarding_end_of_service?: string | null;
  bags_status?: string | null;
};

function pushField(
  fields: TrackReportField[],
  label: string,
  value: string | null | undefined
): void {
  const v = String(value ?? "").trim();
  if (v) fields.push({ label, value: v });
}

export function buildTrackMissionReportSummary(
  row: TrackReportRowSlice | null | undefined
): TrackMissionReportSummary | null {
  if (!row || !String(row.completed_at ?? "").trim()) return null;

  const kind = resolveServiceReportKind({
    reportKindStored: row.report_kind,
    serviceType: row.service_type,
  });
  const fields: TrackReportField[] = [];

  if (kind === "arrival") {
    if (row.no_show) {
      pushField(fields, "No Show", "Yes");
      pushField(fields, "Comments", row.comments);
      return fields.length > 0 ? { reportKind: kind, fields } : null;
    }
    pushField(fields, "Number of PAX", row.pax != null ? String(row.pax) : null);
    pushField(fields, "Travel Class", row.travel_class);
    pushField(fields, "Deplanning", row.deplanning);
    pushField(fields, "Immigration Speed", row.immigration_speed);
    if (row.no_checked_bags) {
      pushField(fields, "Checked Bags", "No checked bags — carry-on only");
    } else if (row.checkin_bags != null) {
      pushField(fields, "Checked Bags", String(row.checkin_bags));
    }
    const customs = customsControlPdfLabel(row.customs_control);
    if (customs && customs !== "—") {
      pushField(fields, "Customs Control", customs);
    }
    pushField(fields, "Place End of Service", row.place_end_of_service);
    pushField(fields, "Comments", row.comments);
  } else if (kind === "departure") {
    pushField(fields, "Number of PAX", row.pax != null ? String(row.pax) : null);
    pushField(fields, "Travel Class", row.travel_class);
    const taxLabel = taxRefundPdfLabelFromReport({
      taxRefund: row.tax_refund,
      taxRefundSpeed: row.tax_refund_speed,
      taxRefundBy: row.tax_refund_by,
    });
    if (taxLabel && taxLabel !== "—") {
      pushField(fields, "Tax Refund", taxLabel);
    }
    if (
      taxRefundHasDetails({
        taxRefund: row.tax_refund,
        taxRefundSpeed: row.tax_refund_speed,
        taxRefundBy: row.tax_refund_by,
      })
    ) {
      pushField(fields, "Tax Refund Speed", row.tax_refund_speed);
      pushField(fields, "Tax Refund By", row.tax_refund_by);
    }
    pushField(fields, "End of Service", row.boarding_end_of_service);
    pushField(
      fields,
      "Immigration & Security Speed",
      row.immigration_security_speed
    );
    pushField(fields, "Comments", row.comments);
  } else {
    pushField(fields, "Deplanning", row.deplanning);
    pushField(fields, "Travel Class", row.travel_class);
    const lounge = vipLoungePdfLabel(row.vip_lounge);
    if (lounge && lounge !== "—") pushField(fields, "VIP Lounge", lounge);
    pushField(fields, "End of Service", row.boarding_end_of_service);
    pushField(
      fields,
      "Immigration & Security Speed",
      row.immigration_security_speed
    );
    const bags = bagsStatusDisplayLabel(row.bags_status ?? null);
    if (bags && bags !== "—") pushField(fields, "Baggage Status", bags);
    pushField(fields, "Comments", row.comments);
  }

  if (fields.length === 0) return null;
  return { reportKind: kind, fields };
}
