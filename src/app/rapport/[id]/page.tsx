"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

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
import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  PLANNING_URGENT_ASSIGNEE_SLUG,
  assigneeSlugToNotifyLabel,
  isUrgentAssignee,
  normalizeAssigneeListFromStored,
} from "@/lib/planning/planning-team";
import {
  defaultReportFilename,
  generateServiceReportPdf,
} from "@/lib/reports/service-report-pdf";

type PlanningServicesPayload = {
  rows: DailyServiceRow[];
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
};

const PLANNING_ASSIGNEES_STORAGE_KEY = "meltin_planning_assignees_v3";

function loadPrimaryAssigneeLabel(spreadsheetId: string, rowKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLANNING_ASSIGNEES_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const store = parsed as Record<string, Record<string, unknown>>;
    const sheetMap = store[spreadsheetId];
    if (!sheetMap) return null;
    const list = normalizeAssigneeListFromStored(sheetMap[rowKey]);
    for (const slug of list) {
      if (slug === DEFAULT_PLANNING_ASSIGNEE_SLUG) continue;
      if (slug === PLANNING_URGENT_ASSIGNEE_SLUG || isUrgentAssignee(slug)) continue;
      const label = assigneeSlugToNotifyLabel(slug);
      if (label) return label;
      return slug;
    }
    return null;
  } catch {
    return null;
  }
}

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

  const [deplanning, setDeplanning] = useState<string>("");
  const [pax, setPax] = useState<number | null>(null);
  const [serviceStartedAt, setServiceStartedAt] = useState<string>("");
  const [meetingTime, setMeetingTime] = useState<string>("");
  const [travelClass, setTravelClass] = useState<string>("");
  const [immigrationSpeed, setImmigrationSpeed] = useState<string>("");
  const [checkinBags, setCheckinBags] = useState<number | null>(null);
  const [customsControl, setCustomsControl] = useState<boolean | null>(null);
  const [taxRefund, setTaxRefund] = useState<boolean | null>(null);
  const [taxRefundSpeed, setTaxRefundSpeed] = useState<string>("");
  const [taxRefundBy, setTaxRefundBy] = useState<string>("");
  const [checkin, setCheckin] = useState<boolean | null>(null);
  const [immigrationSecurity, setImmigrationSecurity] = useState<boolean | null>(
    null
  );
  const [immigrationSecuritySpeed, setImmigrationSecuritySpeed] =
    useState<string>("");
  const [vipLounge, setVipLounge] = useState<boolean | null>(null);
  const [boardingEndOfService, setBoardingEndOfService] = useState<string>("");
  const [transitBags, setTransitBags] = useState<string>("");
  const [endOfService, setEndOfService] = useState<string>("");
  const [placeEndOfService, setPlaceEndOfService] = useState<string>("");
  const [comments, setComments] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingReport) return;
    setDeplanning(existingReport.deplanning ?? "");
    setPax(existingReport.pax ?? null);
    setServiceStartedAt(existingReport.service_started_at ?? "");
    setMeetingTime(existingReport.meeting_time ?? "");
    setTravelClass(existingReport.travel_class ?? "");
    setImmigrationSpeed(existingReport.immigration_speed ?? "");
    setCheckinBags(existingReport.checkin_bags ?? null);
    setCustomsControl(
      typeof existingReport.customs_control === "boolean"
        ? existingReport.customs_control
        : null
    );
    setTaxRefund(
      typeof existingReport.tax_refund === "boolean"
        ? existingReport.tax_refund
        : null
    );
    setTaxRefundSpeed(existingReport.tax_refund_speed ?? "");
    setTaxRefundBy(existingReport.tax_refund_by ?? "");
    setCheckin(
      typeof existingReport.checkin === "boolean" ? existingReport.checkin : null
    );
    setImmigrationSecurity(
      typeof existingReport.immigration_security === "boolean"
        ? existingReport.immigration_security
        : null
    );
    setImmigrationSecuritySpeed(existingReport.immigration_security_speed ?? "");
    setVipLounge(
      typeof existingReport.vip_lounge === "boolean"
        ? existingReport.vip_lounge
        : null
    );
    setBoardingEndOfService(existingReport.boarding_end_of_service ?? "");
    setTransitBags(existingReport.transit_bags ?? "");
    setEndOfService(existingReport.end_of_service ?? "");
    setPlaceEndOfService(existingReport.place_end_of_service ?? "");
    setComments(existingReport.comments ?? "");
  }, [existingReport]);

  const pageTitle = serviceRow?.client?.trim() || "Rapport de service";
  const primaryAssignee = useMemo(() => {
    if (!spreadsheetId || !serviceRow) return null;
    return loadPrimaryAssigneeLabel(spreadsheetId, stableServiceRowKey(serviceRow));
  }, [spreadsheetId, serviceRow]);

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
    try {
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

        deplanning: deplanning || null,
        pax,
        service_started_at: serviceStartedAt || null,
        meeting_time: meetingTime || null,
        travel_class: travelClass || null,
        immigration_speed: immigrationSpeed || null,
        checkin_bags: checkinBags,
        customs_control: customsControl,
        tax_refund: taxRefund,
        tax_refund_speed: taxRefundSpeed || null,
        tax_refund_by: taxRefundBy || null,
        checkin,
        immigration_security: immigrationSecurity,
        immigration_security_speed: immigrationSecuritySpeed || null,
        vip_lounge: vipLounge,
        boarding_end_of_service: boardingEndOfService || null,
        transit_bags: transitBags || null,
        end_of_service: endOfService || null,
        place_end_of_service: placeEndOfService || null,
        comments: comments || null,
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

      const doc = await generateServiceReportPdf({
        title: "Rapport de service",
        reportKind,
        serviceClient: saved.service_client,
        serviceType: saved.service_type,
        serviceDateIso: saved.service_date,
        serviceVol: saved.service_vol,
        serviceRdv1: saved.service_rdv1,
        serviceRdv2: saved.service_rdv2,
        serviceDestProv: saved.service_dest_prov,
        serviceTel: saved.service_tel,
        serviceDriverInfo: saved.service_driver_info,
        assigneeName: saved.assignee_name,
        deplanning: saved.deplanning,
        pax: saved.pax,
        serviceStartedAt: saved.service_started_at,
        meetingTime: saved.meeting_time,
        travelClass: saved.travel_class,
        immigrationSpeed: saved.immigration_speed,
        immigrationSecurity: saved.immigration_security,
        immigrationSecuritySpeed: saved.immigration_security_speed,
        checkinBags: saved.checkin_bags,
        customsControl: saved.customs_control,
        taxRefund: saved.tax_refund,
        taxRefundSpeed: saved.tax_refund_speed,
        taxRefundBy: saved.tax_refund_by,
        checkin: saved.checkin,
        vipLounge: saved.vip_lounge,
        boardingEndOfService: saved.boarding_end_of_service,
        transitBags: saved.transit_bags,
        endOfService: saved.end_of_service,
        placeEndOfService: saved.place_end_of_service,
        comments: saved.comments,
      });

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
      setSubmitError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const paxOptions = useMemo(
    () => Array.from({ length: 10 }, (_, i) => i + 1),
    []
  );
  const bagOptions = useMemo(
    () => Array.from({ length: 20 }, (_, i) => i + 1),
    []
  );

  const boardingOptions = useMemo(
    () => [
      "SELF BOARDING END AT LOUNGE",
      "SELF BOARDING END AT THE GATE",
      "SELF BOARDING END AT THE DUTY FREE",
      "BOARDING BY AGENT",
    ],
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

          <div className="grid gap-4 sm:grid-cols-2">
            {reportKind !== "departure" ? (
              <div className="space-y-1.5">
                <Label>DEPLANNING</Label>
                <Select
                  value={deplanning || undefined}
                  onValueChange={(v) => setDeplanning(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reportKind === "arrival" ? (
                      <>
                        <SelectItem value="BLOCK">BLOCK</SelectItem>
                        <SelectItem value="BY BUS">BY BUS</SelectItem>
                        <SelectItem value="AGENT WAITED AT BUS TERMINAL">
                          AGENT WAITED AT BUS TERMINAL
                        </SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="BY BUS">BY BUS</SelectItem>
                        <SelectItem value="BLOCK">BLOCK</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

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
                <Label>SERVICE STARTED AT</Label>
                <Input
                  type="time"
                  value={serviceStartedAt}
                  onChange={(e) => setServiceStartedAt(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>MEETING TIME</Label>
                <Input
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>TRAVEL CLASS</Label>
              <Select
                value={travelClass || undefined}
                onValueChange={(v) => setTravelClass(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUSINESS">BUSINESS</SelectItem>
                  {reportKind === "arrival" ? (
                    <SelectItem value="FIRST CLASS">FIRST CLASS</SelectItem>
                  ) : (
                    <SelectItem value="FIRST">FIRST</SelectItem>
                  )}
                  <SelectItem value="ECONOMY">ECONOMY</SelectItem>
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
            ) : null}

            {reportKind !== "transit" ? (
              <div className="space-y-1.5">
                <Label>CHECKIN BAGS</Label>
                <Select
                  value={checkinBags != null ? String(checkinBags) : undefined}
                  onValueChange={(v) => setCheckinBags(v ? Number(v) : null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bagOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {reportKind === "arrival" ? (
              <div className="space-y-1.5">
                <Label>CUSTOMS CONTROL</Label>
                <Select
                  value={
                    customsControl === true
                      ? "YES"
                      : customsControl === false
                        ? "NO"
                        : undefined
                  }
                  onValueChange={(v) =>
                    setCustomsControl(
                      v === "YES" ? true : v === "NO" ? false : null
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">YES</SelectItem>
                    <SelectItem value="NO">NO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {reportKind === "departure" ? (
              <>
                <div className="space-y-1.5">
                  <Label>TAX REFUND</Label>
                  <Select
                    value={
                      taxRefund === true
                        ? "YES"
                        : taxRefund === false
                          ? "NO"
                          : undefined
                    }
                    onValueChange={(v) =>
                      setTaxRefund(v === "YES" ? true : v === "NO" ? false : null)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YES">YES</SelectItem>
                      <SelectItem value="NO">NO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>TAX REFUND TIME</Label>
                  <Select
                    value={taxRefundSpeed || undefined}
                    onValueChange={(v) => setTaxRefundSpeed(v ?? "")}
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

                <div className="space-y-1.5">
                  <Label>REFUND TAX BY</Label>
                  <Select
                    value={taxRefundBy || undefined}
                    onValueChange={(v) => setTaxRefundBy(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">CASH</SelectItem>
                      <SelectItem value="CREDIT CARD">CREDIT CARD</SelectItem>
                      <SelectItem value="MIX">MIX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>CHECKIN</Label>
                  <Select
                    value={
                      checkin === true
                        ? "YES"
                        : checkin === false
                          ? "NO"
                          : undefined
                    }
                    onValueChange={(v) =>
                      setCheckin(v === "YES" ? true : v === "NO" ? false : null)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YES">YES</SelectItem>
                      <SelectItem value="NO">NO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {reportKind !== "arrival" ? (
              <>
                {reportKind === "transit" ? (
                  <div className="space-y-1.5">
                    <Label>TRANSIT BAGS</Label>
                    <Select
                      value={transitBags || undefined}
                      onValueChange={(v) => setTransitBags(v ?? "")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CHECKIN THROUGHT FINAL DESTINATION">
                          CHECKIN THROUGHT FINAL DESTINATION
                        </SelectItem>
                        <SelectItem value="COLLECT IN PARIS & RE-CHECK">
                          COLLECT IN PARIS & RE-CHECK
                        </SelectItem>
                        <SelectItem value="NO BAGS">NO BAGS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {reportKind === "transit" ? (
                  <div className="space-y-1.5">
                    <Label>IMMIGRATION &amp; SECURITY</Label>
                    <Select
                      value={
                        immigrationSecurity === true
                          ? "YES"
                          : immigrationSecurity === false
                            ? "NO"
                            : undefined
                      }
                      onValueChange={(v) =>
                        setImmigrationSecurity(
                          v === "YES" ? true : v === "NO" ? false : null
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YES">YES</SelectItem>
                        <SelectItem value="NO">NO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

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

                <div className="space-y-1.5">
                  <Label>VIP LOUNGE</Label>
                  <Select
                    value={
                      vipLounge === true
                        ? "YES"
                        : vipLounge === false
                          ? "NO"
                          : undefined
                    }
                    onValueChange={(v) =>
                      setVipLounge(v === "YES" ? true : v === "NO" ? false : null)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YES">YES</SelectItem>
                      <SelectItem value="NO">NO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            <div className="space-y-1.5">
              <Label>END OF SERVICE</Label>
              <Input
                type="time"
                value={endOfService}
                onChange={(e) => setEndOfService(e.target.value)}
              />
            </div>

            {reportKind === "arrival" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>PLACE END OF SERVICE</Label>
                <Select
                  value={placeEndOfService || undefined}
                  onValueChange={(v) => setPlaceEndOfService(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRIVER ON TIME">DRIVER ON TIME</SelectItem>
                    <SelectItem value="DRIVER LATE">DRIVER LATE</SelectItem>
                    <SelectItem value="DRIVER LATE- PAX took taxi">
                      DRIVER LATE- PAX took taxi
                    </SelectItem>
                    <SelectItem value="TAXI/UBER">TAXI/UBER</SelectItem>
                    <SelectItem value="HOTEL">HOTEL</SelectItem>
                    <SelectItem value="TRAIN STATION">TRAIN STATION</SelectItem>
                    <SelectItem value="RENTAL CAR">RENTAL CAR</SelectItem>
                    <SelectItem value="OTHER">OTHER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>BOARDING / END OF SERVICE</Label>
                <Select
                  value={boardingEndOfService || undefined}
                  onValueChange={(v) => setBoardingEndOfService(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {boardingOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
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

