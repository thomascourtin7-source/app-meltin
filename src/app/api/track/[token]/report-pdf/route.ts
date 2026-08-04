import { NextResponse } from "next/server";

import { loadTrackReportPdfByToken } from "@/lib/client-chat/track-server";
import {
  defaultReportFilename,
  generateServiceReportPdf,
  serviceReportSnapshotToPdfData,
} from "@/lib/reports/service-report-pdf";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const loaded = await loadTrackReportPdfByToken(token);
  if (!loaded) {
    return NextResponse.json({ error: "Report not available." }, { status: 404 });
  }

  const doc = await generateServiceReportPdf(
    serviceReportSnapshotToPdfData({
      row: loaded.row,
      reportKind: loaded.reportKind,
      title: "Mission Report",
    })
  );

  const filename = defaultReportFilename({
    serviceClient: loaded.row.service_client,
    serviceDateIso: loaded.row.service_date,
  });
  const pdfBytes = doc.output("arraybuffer");

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
