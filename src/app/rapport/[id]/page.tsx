"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { stableServiceRowKey } from "@/lib/planning/service-row-keys";
import {
  detectServiceReportKind,
  type ServiceReportKind,
} from "@/lib/planning/service-kind";
import { serviceReportIdFromRow } from "@/lib/reports/service-report-id";
import {
  assigneeSlugToNotifyLabel,
} from "@/lib/planning/planning-team";
import { patchServiceReportsSwCaches } from "@/lib/planning/service-reports-swr";
import {
  defaultReportFilename,
  generateServiceReportPdf,
  serviceReportSnapshotToPdfData,
} from "@/lib/reports/service-report-pdf";
import { formatTimeForDisplay } from "@/lib/reports/report-time";

type PlanningServicesPayload = {
  rows: DailyServiceRow[];
  assigneesByServiceId?: Record<string, string>;
  fetchedAt: string;
  spreadsheetId?: string;
  filterDateIso?: string | null;
};

type ServiceReportRow = {
  spreadsheet_id: string;
  service_id: string;
  service_date: string;
  service_client: string;
  service_type: string;
  service_tel: string | null;
  service_vol: string | null;
  service_rdv1: string | null;
  service_rdv2: string | null;
  service_dest_prov: string | null;
  service_driver_info: string | null;
  assignee_name: string | null;
  report_kind: string;
  deplanning: string | null;
  pax: number | null;
  service_started_at: string | null;
  travel_class: string | null;
  immigration_speed: string | null;
  checkin_bags: number | null;
  customs_control: boolean | null;
  end_of_service: string | null;
  place_end_of_service: string | null;
  comments: string | null;

  meeting_time: string | null;
  tax_refund: boolean | null;
  tax_refund_speed: string | null;
  tax_refund_by: string | null;
  checkin: boolean | null;
  immigration_security: boolean | null;
  immigration_security_speed: string | null;
  vip_lounge: boolean | null;
  boarding_end_of_service: string | null;
  transit_bags: string | null;
  is_pec: boolean | null;
  completed_at: string | null;
  photo_url: string | null;
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data: unknown = await res.json();
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Erreur réseau.";
    throw new Error(msg);
  }
  return data as T;
}

export default function RapportServicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { mutate: swrMutate } = useSWRConfig();

  const serviceId = decodeURIComponent(params.id || "").trim();

  const spreadsheetId =
    (searchParams.get("spreadsheetId") || "").trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    "";

  const dateParam = (searchParams.get("date") || "").trim();
  const dateIso = dateParam ? normalizeCanonicalDateKey(dateParam) : "";

  const planningUrl = useMemo(() => {
    if (!spreadsheetId || !dateIso) return null;
    return `/api/planning-services?spreadsheetId=${encodeURIComponent(
      spreadsheetId
    )}&date=${encodeURIComponent(dateIso)}`;
  }, [spreadsheetId, dateIso]);

  const { data: planningData, error: planningError, isLoading: planningLoading } =
    useSWR(planningUrl, (u) => jsonFetcher<PlanningServicesPayload>(u));

  const serviceRow = useMemo(() => {
    const rows = planningData?.rows ?? [];
    return rows.find((r) => serviceReportIdFromRow(r) === serviceId) ?? null;
  }, [planningData?.rows, serviceId]);

  const detectedKind: ServiceReportKind = useMemo(() => {
    return detectServiceReportKind(serviceRow?.type);
  }, [serviceRow?.type]);

  const reportUrl = useMemo(() => {
    if (!spreadsheetId || !serviceId) return null;
    return `/api/service-reports?spreadsheetId=${encodeURIComponent(
      spreadsheetId
    )}&serviceId=${encodeURIComponent(serviceId)}`;
  }, [spreadsheetId, serviceId]);

  const { data: existingReportData, isLoading: reportLoading } = useSWR(
    reportUrl,
    (u) => jsonFetcher<{ report: ServiceReportRow | null }>(u),
    { revalidateOnFocus: false }
  );

  const existingReport = existingReportData?.report ?? null;

  const reportKind: ServiceReportKind = useMemo(() => {
    const stored = (existingReport?.report_kind || "").trim().toLowerCase();
    if (stored === "departure" || stored === "transit" || stored === "arrival") {
      return stored as ServiceReportKind;
    }
    return detectedKind;
  }, [existingReport?.report_kind, detectedKind]);

  const [pax, setPax] = useState<number | null>(null);
  const [immigrationSpeed, setImmigrationSpeed] = useState<string>("");
  const [immigrationSecuritySpeed, setImmigrationSecuritySpeed] =
    useState<string>("");
  const [comments, setComments] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingReport) return;
    setPax(existingReport.pax ?? null);
    setImmigrationSpeed(existingReport.immigration_speed ?? "");
    setImmigrationSecuritySpeed(existingReport.immigration_security_speed ?? "");
    setComments(existingReport.comments ?? "");
  }, [existingReport]);

  const pageTitle = serviceRow?.client?.trim() || "Rapport de service";
  const primaryAssignee = useMemo(() => {
    if (!serviceRow) return null;
    const serviceIdFromRow = serviceReportIdFromRow(serviceRow);
    const fromPlanning =
      (planningData?.assigneesByServiceId?.[serviceIdFromRow] || "").trim();
    return fromPlanning || null;
  }, [planningData?.assigneesByServiceId, serviceRow]);

  async function handleEnd(): Promise<void> {
    setSubmitError(null);
    if (!spreadsheetId) {
      setSubmitError("spreadsheetId manquant.");
      return;
    }
    if (!serviceRow) {
      setSubmitError("Service introuvable pour ce rapport.");
      return;
    }

    setIsSubmitting(true);
    const dateKeyForPlanning = (
      serviceRow.dateIso ? normalizeCanonicalDateKey(serviceRow.dateIso) : dateIso
    ).trim();
    let optimisticCompletionApplied = false;
    if (spreadsheetId && dateKeyForPlanning) {
      patchServiceReportsSwCaches(swrMutate, {
        spreadsheetId,
        dateKey: dateKeyForPlanning,
        serviceId,
        isCompleted: true,
      });
      optimisticCompletionApplied = true;
    }
    let reportPersistedAsComplete = false;
    try {
      const snapRes = await fetch(
        `/api/service-reports?spreadsheetId=${encodeURIComponent(
          spreadsheetId
        )}&serviceId=${encodeURIComponent(serviceId)}`
      );
      const snapJson = (await snapRes.json()) as {
        report: ServiceReportRow | null;
        error?: string;
      };
      if (!snapRes.ok) {
        throw new Error(snapJson?.error || "Impossible de relire le rapport.");
      }
      const latest = snapJson.report ?? existingReport;

      const payload: Partial<ServiceReportRow> = {
        spreadsheet_id: spreadsheetId,
        service_id: serviceId,
        service_date: serviceRow.dateIso,
        service_client: serviceRow.client,
        service_type: serviceRow.type,
        service_tel: serviceRow.tel || null,
        service_vol: serviceRow.vol || null,
        service_rdv1: serviceRow.rdv1 || null,
        service_rdv2: serviceRow.rdv2 || null,
        service_dest_prov: serviceRow.destProv || null,
        service_driver_info: serviceRow.driverInfo || null,
        assignee_name: primaryAssignee,
        report_kind: reportKind,
        completed_at: new Date().toISOString(),

        meeting_time: latest?.meeting_time ?? null,
        end_of_service: latest?.end_of_service ?? null,
        photo_url: latest?.photo_url ?? null,
        is_pec:
          typeof latest?.is_pec === "boolean" ? latest.is_pec : false,

        pax,
        comments: comments || null,
        immigration_speed:
          reportKind === "arrival" ? immigrationSpeed || null : null,
        immigration_security_speed:
          reportKind !== "arrival" ? immigrationSecuritySpeed || null : null,

        deplanning: null,
        service_started_at: null,
        travel_class: null,
        checkin_bags: null,
        customs_control: null,
        tax_refund: null,
        tax_refund_speed: null,
        tax_refund_by: null,
        checkin: null,
        immigration_security: null,
        vip_lounge: null,
        boarding_end_of_service: null,
        transit_bags: null,
        place_end_of_service: null,
      };

      const saveRes = await fetch("/api/service-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saveJson: unknown = await saveRes.json();
      if (!saveRes.ok) {
        const msg =
          saveJson &&
          typeof saveJson === "object" &&
          "error" in saveJson &&
          typeof (saveJson as { error: unknown }).error === "string"
            ? (saveJson as { error: string }).error
            : "Enregistrement impossible.";
        throw new Error(msg);
      }

      const saved = (saveJson as { report: ServiceReportRow }).report;
      reportPersistedAsComplete = true;

      const doc = await generateServiceReportPdf(
        serviceReportSnapshotToPdfData({
          row: saved,
          reportKind,
          title: "Rapport de service",
        })
      );

      doc.save(
        defaultReportFilename({
          serviceClient: saved.service_client,
          serviceDateIso: saved.service_date,
        })
      );

      try {
        sessionStorage.setItem("meltin_service_report_saved_flash", "1");
      } catch {
        /* ignore */
      }
      router.push("/planning");
    } catch (e) {
      if (
        optimisticCompletionApplied &&
        !reportPersistedAsComplete &&
        spreadsheetId &&
        dateKeyForPlanning
      ) {
        patchServiceReportsSwCaches(swrMutate, {
          spreadsheetId,
          dateKey: dateKeyForPlanning,
          serviceId,
          isCompleted: false,
        });
      }
      setSubmitError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const paxOptions = useMemo(
    () => Array.from({ length: 10 }, (_, i) => i + 1),
    []
  );
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {pageTitle}
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {serviceRow ? (
              <>
                <div className="mt-1">
                  <span className="font-medium text-foreground">Service</span>{" "}
                  · {serviceRow.type || "—"} · {serviceRow.dateIso || "—"}
                </div>
                <div className="mt-1">
                  {primaryAssignee ? (
                    <>
                      Agent assigné :{" "}
                      <span className="font-medium text-foreground">
                        {primaryAssignee}
                      </span>
                    </>
                  ) : (
                    "Agent assigné : —"
                  )}
                </div>
              </>
            ) : planningLoading ? (
              "Chargement du service…"
            ) : planningError ? (
              "Impossible de charger le service."
            ) : (
              "Service introuvable."
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {!dateIso || !spreadsheetId ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              L’URL doit contenir `spreadsheetId` et `date`.
            </div>
          ) : null}

          {/* debug banner removed */}

          <div className="rounded-lg border border-border/60 bg-muted/25 p-4 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Horaires (automatiques)
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Début : photo réussie sur le planning. Fin : ouverture du formulaire
              depuis le planning.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  Début du service
                </div>
                <div className="mt-0.5 rounded-md border border-transparent bg-background/80 px-2 py-1.5 font-medium text-foreground">
                  {formatTimeForDisplay(existingReport?.meeting_time)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  Fin du service
                </div>
                <div className="mt-0.5 rounded-md border border-transparent bg-background/80 px-2 py-1.5 font-medium text-foreground">
                  {formatTimeForDisplay(existingReport?.end_of_service)}
                </div>
              </div>
            </div>
          </div>

          {existingReport?.photo_url?.trim() && reportKind !== "departure" ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Photo du service
              </div>
              <img
                src={existingReport.photo_url.trim()}
                alt="Photo jointe au rapport"
                className="max-h-72 w-full max-w-md rounded-lg border border-border object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>PAX</Label>
              <Select
                value={pax != null ? String(pax) : undefined}
                onValueChange={(v) => setPax(v ? Number(v) : null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {paxOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {reportKind === "arrival" ? (
              <div className="space-y-1.5">
                <Label>IMMIGRATION SPEED</Label>
                <Select
                  value={immigrationSpeed || undefined}
                  onValueChange={(v) => setImmigrationSpeed(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NO IMMIGRATION">NO IMMIGRATION</SelectItem>
                    <SelectItem value="QUEUE">QUEUE</SelectItem>
                    <SelectItem value="FAST">FAST</SelectItem>
                    <SelectItem value="VERY FAST">VERY FAST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>IMMIGRATION &amp; SECURITY SPEED</Label>
                <Select
                  value={immigrationSecuritySpeed || undefined}
                  onValueChange={(v) => setImmigrationSecuritySpeed(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FAST">FAST</SelectItem>
                    <SelectItem value="VERY FAST">VERY FAST</SelectItem>
                    <SelectItem value="QUEUE">QUEUE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label>COMMENTS</Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="..."
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/planning")}
          >
            Retour planning
          </Button>
          <div className="flex items-center gap-2">
            {existingReport || reportLoading ? (
              <div className="text-xs text-muted-foreground">
                {reportLoading
                  ? "Vérification du rapport…"
                  : existingReport
                    ? "Rapport existant: vous allez le remplacer."
                    : null}
              </div>
            ) : null}
            <Button
              type="button"
              onClick={handleEnd}
              disabled={isSubmitting || planningLoading || !serviceRow}
            >
              {isSubmitting ? "Enregistrement…" : "END"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {submitError ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {submitError}
        </div>
      ) : null}
    </div>
  );
}

