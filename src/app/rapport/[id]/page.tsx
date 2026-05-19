"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { patchServiceReportsSwCaches } from "@/lib/planning/service-reports-swr";
import {
  defaultReportFilename,
  generateServiceReportPdf,
  serviceReportSnapshotToPdfData,
} from "@/lib/reports/service-report-pdf";
import {
  formatTimeForDisplay,
  postgresTimeFromTimeInput,
  timeToTimeInputValue,
} from "@/lib/reports/report-time";
import {
  readBagsStatusFromReport,
  TRANSIT_BAGS_STATUS_OPTIONS,
} from "@/lib/reports/transit-bags-status";

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
  bags_status: string | null;
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

function isLikelyNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("connexion")
  );
}

function classifySubmitError(error: unknown): {
  message: string;
  retryable: boolean;
} {
  if (isLikelyNetworkError(error)) {
    return {
      message:
        "Connexion instable ou interrompue. Vérifiez le réseau puis réessayez.",
      retryable: true,
    };
  }
  const message =
    error instanceof Error ? error.message : "Erreur inconnue lors de l’envoi.";
  return { message, retryable: false };
}

const REPORT_PDF_MAX_WAIT_MS = 4_000;

async function tryDownloadReportPdf(
  saved: ServiceReportRow,
  reportKind: ServiceReportKind
): Promise<void> {
  const pdfTask = (async () => {
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
  })();

  await Promise.race([
    pdfTask,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, REPORT_PDF_MAX_WAIT_MS);
    }),
  ]);
}

function leaveReportPageForPlanning(): void {
  try {
    sessionStorage.setItem("meltin_service_report_saved_flash", "1");
  } catch {
    /* ignore */
  }
  window.location.assign("/planning");
}

async function fetchReportSnapshot(
  spreadsheetId: string,
  serviceId: string
): Promise<ServiceReportRow | null> {
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
  return snapJson.report ?? null;
}

async function persistCompletedReport(
  payload: Partial<ServiceReportRow>
): Promise<ServiceReportRow> {
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
  const saved = (saveJson as { report?: ServiceReportRow }).report;
  if (!saved?.completed_at) {
    throw new Error(
      "Le serveur n’a pas confirmé la fin du rapport. Réessayez."
    );
  }
  return saved;
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
  const [bagsStatus, setBagsStatus] = useState<string>("");
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [meetingTimeEdit, setMeetingTimeEdit] = useState("");
  const [endOfServiceEdit, setEndOfServiceEdit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitRetryable, setSubmitRetryable] = useState(false);
  const [isLeavingPage, setIsLeavingPage] = useState(false);
  const submitLockRef = useRef(false);
  const redirectScheduledRef = useRef(false);

  const resetReportFormState = useCallback(() => {
    setPax(null);
    setImmigrationSpeed("");
    setImmigrationSecuritySpeed("");
    setComments("");
    setBagsStatus("");
    setIsEditingHours(false);
    setMeetingTimeEdit("");
    setEndOfServiceEdit("");
    setSubmitError(null);
    setSubmitRetryable(false);
  }, []);

  const redirectToPlanning = useCallback(() => {
    if (redirectScheduledRef.current) return;
    redirectScheduledRef.current = true;
    setIsLeavingPage(true);
    window.setTimeout(() => leaveReportPageForPlanning(), 0);
  }, []);

  useEffect(() => {
    if (isSubmitting || redirectScheduledRef.current) return;
    if (!existingReport) return;
    setPax(existingReport.pax ?? null);
    setImmigrationSpeed(existingReport.immigration_speed ?? "");
    setImmigrationSecuritySpeed(existingReport.immigration_security_speed ?? "");
    setComments(existingReport.comments ?? "");
    setBagsStatus(readBagsStatusFromReport(existingReport));
    setMeetingTimeEdit(timeToTimeInputValue(existingReport.meeting_time));
    setEndOfServiceEdit(timeToTimeInputValue(existingReport.end_of_service));
  }, [existingReport, isSubmitting]);

  const pageTitle = serviceRow?.client?.trim() || "Rapport de service";
  const primaryAssignee = useMemo(() => {
    if (!serviceRow) return null;
    const serviceIdFromRow = serviceReportIdFromRow(serviceRow);
    const fromPlanning =
      (planningData?.assigneesByServiceId?.[serviceIdFromRow] || "").trim();
    return fromPlanning || null;
  }, [planningData?.assigneesByServiceId, serviceRow]);

  async function handleEnd(): Promise<void> {
    if (submitLockRef.current || redirectScheduledRef.current) return;

    setSubmitError(null);
    setSubmitRetryable(false);
    if (!spreadsheetId) {
      setSubmitError("spreadsheetId manquant.");
      return;
    }
    if (!serviceRow) {
      setSubmitError("Service introuvable pour ce rapport.");
      return;
    }
    if (reportKind === "transit" && !bagsStatus.trim()) {
      setSubmitError("Veuillez sélectionner le statut bagages (Bagages).");
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);

    const dateKeyForPlanning = (
      serviceRow.dateIso ? normalizeCanonicalDateKey(serviceRow.dateIso) : dateIso
    ).trim();

    try {
      const latest =
        (await fetchReportSnapshot(spreadsheetId, serviceId)) ?? existingReport;
      const automaticMeetingTime = latest?.meeting_time ?? null;
      const automaticEndOfService = latest?.end_of_service ?? null;
      const manualMeetingTime = postgresTimeFromTimeInput(meetingTimeEdit);
      const manualEndOfService = postgresTimeFromTimeInput(endOfServiceEdit);
      const meeting_time = manualMeetingTime ?? automaticMeetingTime;
      const end_of_service = manualEndOfService ?? automaticEndOfService;

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
        meeting_time,
        end_of_service,
        photo_url: latest?.photo_url ?? null,
        is_pec: typeof latest?.is_pec === "boolean" ? latest.is_pec : false,
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
        bags_status: reportKind === "transit" ? bagsStatus.trim() : null,
        place_end_of_service: null,
      };

      const saved = await persistCompletedReport(payload);

      try {
        if (spreadsheetId && dateKeyForPlanning) {
          patchServiceReportsSwCaches(swrMutate, {
            spreadsheetId,
            dateKey: dateKeyForPlanning,
            serviceId,
            isCompleted: true,
          });
        }
      } catch (cacheError) {
        console.warn("[rapport] Mise à jour cache planning ignorée", cacheError);
      }

      try {
        await tryDownloadReportPdf(saved, reportKind);
      } catch (pdfError) {
        console.error("[rapport] PDF non généré après enregistrement", pdfError);
      }

      resetReportFormState();
      redirectToPlanning();
    } catch (e) {
      const { message, retryable } = classifySubmitError(e);
      setSubmitError(message);
      setSubmitRetryable(retryable);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  const paxOptions = useMemo(
    () => Array.from({ length: 10 }, (_, i) => i + 1),
    []
  );

  const transitBagsMissing = reportKind === "transit" && !bagsStatus.trim();
  const endDisabled =
    isSubmitting || planningLoading || !serviceRow || transitBagsMissing;
  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 py-6">
      {isSubmitting || isLeavingPage ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/60"
          aria-hidden
        >
          <p className="text-sm font-medium text-muted-foreground">
            {isLeavingPage ? "Retour au planning…" : "Enregistrement…"}
          </p>
        </div>
      ) : null}
      <Card
        className={
          isSubmitting || isLeavingPage ? "pointer-events-none opacity-80" : undefined
        }
      >
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Horaires (automatiques)
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditingHours((v) => !v)}
                aria-pressed={isEditingHours}
                aria-label={
                  isEditingHours
                    ? "Terminer la modification des horaires"
                    : "Modifier les horaires"
                }
              >
                <Pencil className="size-3.5" aria-hidden />
                {isEditingHours ? "Terminer" : "Modifier"}
              </Button>
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
                {isEditingHours ? (
                  <Input
                    type="time"
                    step={60}
                    autoComplete="off"
                    value={meetingTimeEdit}
                    onChange={(e) => setMeetingTimeEdit(e.target.value)}
                    className="mt-0.5 h-9 border-border/50 bg-background/80 font-medium text-foreground"
                    aria-label="Début du service"
                  />
                ) : (
                  <div className="mt-0.5 rounded-md border border-transparent bg-background/80 px-2 py-1.5 font-medium text-foreground">
                    {formatTimeForDisplay(
                      meetingTimeEdit
                        ? postgresTimeFromTimeInput(meetingTimeEdit)
                        : existingReport?.meeting_time
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  Fin du service
                </div>
                {isEditingHours ? (
                  <Input
                    type="time"
                    step={60}
                    autoComplete="off"
                    value={endOfServiceEdit}
                    onChange={(e) => setEndOfServiceEdit(e.target.value)}
                    className="mt-0.5 h-9 border-border/50 bg-background/80 font-medium text-foreground"
                    aria-label="Fin du service"
                  />
                ) : (
                  <div className="mt-0.5 rounded-md border border-transparent bg-background/80 px-2 py-1.5 font-medium text-foreground">
                    {formatTimeForDisplay(
                      endOfServiceEdit
                        ? postgresTimeFromTimeInput(endOfServiceEdit)
                        : existingReport?.end_of_service
                    )}
                  </div>
                )}
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

            {reportKind === "transit" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  Bagages (Bags) <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={bagsStatus || undefined}
                  onValueChange={(v) => {
                    setBagsStatus(v ?? "");
                    if (v) {
                      setSubmitError(null);
                      setSubmitRetryable(false);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-required
                    aria-invalid={transitBagsMissing}
                  >
                    <SelectValue placeholder="Choisir le statut bagages…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSIT_BAGS_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

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
            onClick={() => router.replace("/planning")}
            disabled={isSubmitting}
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
              disabled={endDisabled}
            >
              {isSubmitting ? "Enregistrement…" : "END"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {submitError ? (
        <div
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>{submitError}</p>
          {submitRetryable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void handleEnd()}
              disabled={isSubmitting}
            >
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

