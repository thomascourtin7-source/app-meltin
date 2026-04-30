import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ServiceReportPdfData = {
  title: string;
  reportKind?: "arrival" | "departure" | "transit";
  serviceClient: string;
  serviceType: string;
  serviceDateIso: string;
  serviceVol?: string | null;
  serviceRdv1?: string | null;
  serviceRdv2?: string | null;
  serviceDestProv?: string | null;
  serviceTel?: string | null;
  serviceDriverInfo?: string | null;
  assigneeName?: string | null;

  deplanning?: string | null;
  pax?: number | null;
  serviceStartedAt?: string | null;
  meetingTime?: string | null;
  travelClass?: string | null;
  immigrationSpeed?: string | null;
  immigrationSecurity?: boolean | null;
  immigrationSecuritySpeed?: string | null;
  checkinBags?: number | null;
  customsControl?: boolean | null;
  taxRefund?: boolean | null;
  taxRefundSpeed?: string | null;
  taxRefundBy?: string | null;
  checkin?: boolean | null;
  vipLounge?: boolean | null;
  boardingEndOfService?: string | null;
  transitBags?: string | null;
  endOfService?: string | null;
  placeEndOfService?: string | null;
  comments?: string | null;
};

async function tryFetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/icons/icon-192x192.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("logo read failed"));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsDataURL(blob);
    });
    return dataUrl.startsWith("data:") ? dataUrl : null;
  } catch {
    return null;
  }
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function yesNo(v: boolean | null | undefined): string {
  if (v === true) return "YES";
  if (v === false) return "NO";
  return "—";
}

export async function generateServiceReportPdf(
  data: ServiceReportPdfData
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  const logo = await tryFetchLogoDataUrl();
  const marginX = 40;
  const top = 36;

  if (logo) {
    try {
      doc.addImage(logo, "PNG", marginX, top, 48, 48);
    } catch {
      /* ignore logo */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(clean(data.title), marginX + (logo ? 62 : 0), top + 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const subtitle = [
    `Service: ${clean(data.serviceClient) || "—"}`,
    `Type: ${clean(data.serviceType) || "—"}`,
    `Date: ${clean(data.serviceDateIso) || "—"}`,
    data.assigneeName ? `Agent: ${clean(data.assigneeName)}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");
  doc.text(subtitle, marginX + (logo ? 62 : 0), top + 40, {
    maxWidth: pageWidth - marginX * 2 - (logo ? 62 : 0),
  });

  const serviceDetails: Array<[string, string]> = [
    ["VOL", clean(data.serviceVol) || "—"],
    ["DEST/PROV", clean(data.serviceDestProv) || "—"],
  ];

  autoTable(doc, {
    startY: top + 68,
    head: [["Service details", ""]],
    body: serviceDetails,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [20, 20, 20] },
    columnStyles: { 0: { cellWidth: 120 } },
    didParseCell: (hook) => {
      if (hook.section === "head") hook.cell.colSpan = 2;
    },
  });

  const kind = data.reportKind ?? "arrival";
  const kindLabel =
    kind === "departure" ? "Departure" : kind === "transit" ? "Transit" : "Arrival";

  const reportDetails: Array<[string, string]> =
    kind === "departure"
      ? [
          ["PAX", data.pax != null ? String(data.pax) : "—"],
          ["CHECKIN BAGS", data.checkinBags != null ? String(data.checkinBags) : "—"],
          ["MEETING TIME", clean(data.meetingTime) || "—"],
          ["TAX REFUND", yesNo(data.taxRefund)],
          ["TAX REFUND TIME", clean(data.taxRefundSpeed) || "—"],
          ["REFUND TAX BY", clean(data.taxRefundBy) || "—"],
          ["CHECKIN", yesNo(data.checkin)],
          ["TRAVEL CLASS", clean(data.travelClass) || "—"],
          [
            "IMMIGRATION & SECURITY SPEED",
            clean(data.immigrationSecuritySpeed) || "—",
          ],
          ["VIP LOUNGE", yesNo(data.vipLounge)],
          ["BOARDING / END OF SERVICE", clean(data.boardingEndOfService) || "—"],
          ["END OF SERVICE", clean(data.endOfService) || "—"],
          ["COMMENTS", clean(data.comments) || "—"],
        ]
      : kind === "transit"
        ? [
            ["DEPLANNING", clean(data.deplanning) || "—"],
            ["PAX", data.pax != null ? String(data.pax) : "—"],
            ["MEETING TIME", clean(data.meetingTime) || "—"],
            ["TRAVEL CLASS", clean(data.travelClass) || "—"],
            ["TRANSIT BAGS", clean(data.transitBags) || "—"],
            ["IMMIGRATION & SECURITY", yesNo(data.immigrationSecurity)],
            [
              "IMMIGRATION & SECURITY SPEED",
              clean(data.immigrationSecuritySpeed) || "—",
            ],
            ["VIP LOUNGE", yesNo(data.vipLounge)],
            ["BOARDING / END OF SERVICE", clean(data.boardingEndOfService) || "—"],
            ["END OF SERVICE", clean(data.endOfService) || "—"],
            ["COMMENTS", clean(data.comments) || "—"],
          ]
        : [
            ["DEPLANNING", clean(data.deplanning) || "—"],
            ["PAX", data.pax != null ? String(data.pax) : "—"],
            ["SERVICE STARTED AT", clean(data.serviceStartedAt) || "—"],
            ["TRAVEL CLASS", clean(data.travelClass) || "—"],
            ["IMMIGRATION SPEED", clean(data.immigrationSpeed) || "—"],
            [
              "CHECKIN BAGS",
              data.checkinBags != null ? String(data.checkinBags) : "—",
            ],
            ["CUSTOMS CONTROL", yesNo(data.customsControl)],
            ["END OF SERVICE", clean(data.endOfService) || "—"],
            ["PLACE END OF SERVICE", clean(data.placeEndOfService) || "—"],
            ["COMMENTS", clean(data.comments) || "—"],
          ];

  const afterService = (doc as unknown as { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY;
  const startY = typeof afterService === "number" ? afterService + 16 : 220;

  autoTable(doc, {
    startY,
    head: [[`Service report (${kindLabel})`, ""]],
    body: reportDetails,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6, valign: "top" },
    headStyles: { fillColor: [16, 104, 196] },
    columnStyles: {
      0: { cellWidth: 160, fontStyle: "bold" },
      1: { cellWidth: pageWidth - marginX * 2 - 160 },
    },
    didParseCell: (hook) => {
      if (hook.section === "head") hook.cell.colSpan = 2;
      if (hook.section === "body" && hook.column.index === 1) {
        hook.cell.styles.minCellHeight =
          hook.row.index === reportDetails.length - 1 ? 48 : 0; // comments row
      }
    },
  });

  const footerText = `Generated: ${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date())}`;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(footerText, marginX, doc.internal.pageSize.getHeight() - 28);

  return doc;
}

export function defaultReportFilename(opts: {
  serviceClient: string;
  serviceDateIso: string;
}): string {
  const base = `${opts.serviceClient || "service"}_${opts.serviceDateIso || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `rapport_service_${base || "service"}.pdf`;
}

