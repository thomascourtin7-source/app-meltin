"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { type KeyedMutator, useSWRConfig } from "swr";
import {
  Calendar,
  ChevronDown,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  UserCircle,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useLocalSpreadsheetId } from "@/hooks/use-local-spreadsheet-id";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { planningDayBucket } from "@/lib/planning/push-format";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  MAX_PLANNING_ASSIGNEES_PER_SERVICE,
  PLANNING_ASSIGNEE_OPTIONS,
  PLANNING_URGENT_ASSIGNEE_DISPLAY,
  PLANNING_URGENT_ASSIGNEE_SLUG,
  assigneeSlugFromNotifyLabel,
  assigneeSlugToNotifyLabel,
  isUrgentAssignee,
  planningDisplayNameEquals,
  normalizeAssigneeListFromStored,
  matchSheetAssigneeToTeamLabel,
  parseAssigneeNameToSlugs,
  serializeAssigneeSlugsToName,
  normalizeAssigneeStoredValue,
} from "@/lib/planning/planning-team";
import {
  serviceUrgencyIdentityKey,
  stableServiceRowKey,
} from "@/lib/planning/service-row-keys";
import { isPlanningFinalizedForServiceDate } from "@/lib/planning/planning-finalized-storage";
import { computeConflictRowKeys } from "@/lib/planning/time-conflicts";
import { cn } from "@/lib/utils";
import { PlanningPhoneRichText } from "@/components/planning/planning-phone-rich-text";
import { usePlanningPreparation } from "@/components/planning/planning-preparation-context";
import {
  MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
  MELTIN_TEAM_REGISTER_NAME_KEY,
} from "@/components/planning/register-team-button";
import {
  defaultReportFilename,
  generateServiceReportPdf,
} from "@/lib/reports/service-report-pdf";
import { serviceReportIdFromRow } from "@/lib/reports/service-report-id";
import { formatLocalTimeHHMMSS } from "@/lib/reports/report-time";
import { detectServiceReportKind } from "@/lib/planning/service-kind";
import { normalizeServicePhotoForUpload } from "@/lib/planning/normalize-service-photo";
import {
  MELTIN_AUTH_SESSION_CHANGED_EVENT,
  MELTIN_PLANNING_AUTH_SESSION_KEY,
  readPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";
import { usePlanningAdminClient } from "@/hooks/use-planning-admin-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { setPlanningAssigneesRealtimeChannel } from "@/lib/planning/planning-assignees-realtime";

const FORCE_REFRESH_EVENT = "meltin_planning_force_refresh";

type ServiceReportRow = {
  service_client: string;
  service_type: string;
  service_date: string;
  report_kind: string;
  photo_url?: string | null;
  service_vol: string | null;
  service_rdv1: string | null;
  service_rdv2: string | null;
  service_dest_prov: string | null;
  service_tel: string | null;
  service_driver_info: string | null;
  assignee_name: string | null;
  deplanning: string | null;
  pax: number | null;
  service_started_at: string | null;
  meeting_time: string | null;
  travel_class: string | null;
  immigration_speed: string | null;
  immigration_security: boolean | null;
  immigration_security_speed: string | null;
  checkin_bags: number | null;
  customs_control: boolean | null;
  tax_refund: boolean | null;
  tax_refund_speed: string | null;
  tax_refund_by: string | null;
  checkin: boolean | null;
  vip_lounge: boolean | null;
  boarding_end_of_service: string | null;
  transit_bags: string | null;
  end_of_service: string | null;
  place_end_of_service: string | null;
  comments: string | null;
};

const DEFAULT_ASSIGNEE = DEFAULT_PLANNING_ASSIGNEE_SLUG;

/** Snapshots des identités « vues » par jour (détection des nouvelles lignes). */
const PLANNING_ROW_SNAPSHOT_KEY = "meltin_planning_row_snapshot_v1";

type SnapshotStore = Record<string, Record<string, string[]>>;

function loadSnapshotStore(): SnapshotStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLANNING_ROW_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SnapshotStore;
  } catch {
    return {};
  }
}

function saveSnapshotStore(store: SnapshotStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PLANNING_ROW_SNAPSHOT_KEY,
      JSON.stringify(store)
    );
  } catch {
    /* quota */
  }
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysLocal(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

function dateNavButtonClass(active: boolean): string {
  return cn(
    "rounded-lg px-4 py-2 text-sm font-medium shadow-none transition-colors",
    active
      ? "bg-neutral-950 text-white hover:bg-neutral-900 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
      : "bg-muted text-foreground hover:bg-muted/80"
  );
}

/** Vol + créneaux RDV sur une seule ligne lisible. */
function formatVolRdvLine(row: DailyServiceRow): string {
  const vol = row.vol.trim() || "—";
  const r1 = row.rdv1.trim();
  const r2 = row.rdv2.trim();
  let rdvPart = "—";
  if (r1 && r2) rdvPart = `${r1} – ${r2}`;
  else if (r1) rdvPart = r1;
  else if (r2) rdvPart = r2;
  return `Vol : ${vol} | RDV : ${rdvPart}`;
}

function formatRdvForClipboard(row: DailyServiceRow): string {
  const r1 = row.rdv1.trim();
  const r2 = row.rdv2.trim();
  if (r1 && r2) return `${r1} – ${r2}`;
  if (r1) return r1;
  if (r2) return r2;
  return "—";
}

/** Texte partageable (presse-papiers) pour un service du planning. */
function buildServiceDetailsClipboardText(row: DailyServiceRow): string {
  const type = row.type.trim() || "—";
  const client = row.client.trim() || "—";
  const vol = row.vol.trim() || "—";
  const rdv = formatRdvForClipboard(row);
  const dest = row.destProv.trim() || "—";
  const tel = row.tel.trim() || "—";
  return [
    `SERVICE ${type} - ${client}`,
    `✈️ Vol : ${vol}`,
    `⏰ RDV : ${rdv}`,
    `📍 Dest/Prov : ${dest}`,
    `📱 Tél : ${tel}`,
  ].join("\n");
}

/** Nom à mettre en avant (vert) : assigné réel, hors urgence et hors « Non assigné ». */
function isAssigneeHighlighted(slug: string): boolean {
  return (
    slug !== DEFAULT_PLANNING_ASSIGNEE_SLUG && !isUrgentAssignee(slug)
  );
}

type PlanningDebug = {
  range: string;
  rawRowCount: number;
  rawFirstRows: Array<Array<string | number | boolean | null | undefined>>;
  headerRowIndex: number;
  dateColumnIndex: number;
  uniqueParsedDates: string[];
  rawDateCellSamples: unknown[];
};

type PlanningServicesPayload = {
  rows: DailyServiceRow[];
  fetchedAt: string;
  filterDateIso?: string | null;
  debug?: PlanningDebug;
};

type PlanningAssignmentsPayload = {
  assigneesByServiceId: Record<string, string>;
  etaTimeByServiceId: Record<string, string | null>;
};

function etaHHMMFromPlanningColumn(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = raw.trim();
  return /^\d{2}:\d{2}$/.test(t) ? t : null;
}

/** Payload Postgres Realtime (shape stable côté `@supabase/supabase-js`). */
type RealtimePlanningAssignmentPayload = {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};

function assignmentRowFromRealtimeRecord(rec: unknown): {
  service_id: string;
  agent_name: string;
  etaHHMM: string | null;
} | null {
  if (!rec || typeof rec !== "object") return null;
  const o = rec as Record<string, unknown>;
  const sid = typeof o.service_id === "string" ? o.service_id.trim() : "";
  if (!sid) return null;
  return {
    service_id: sid,
    agent_name: typeof o.agent_name === "string" ? o.agent_name : "",
    etaHHMM: etaHHMMFromPlanningColumn(o.eta_time),
  };
}

/** F12 : erreur persistance assignations (`planning_assignments` via API). */
function logErreurSupabase(details: unknown) {
  console.log("ERREUR SUPABASE:", details);
}

function isRealtimePlanningAssignmentDelete(
  payload: RealtimePlanningAssignmentPayload
): boolean {
  const t =
    typeof payload.eventType === "string"
      ? payload.eventType.trim().toUpperCase()
      : "";
  if (t === "DELETE") return true;
  return payload.new == null && payload.old != null;
}

function sameAssigneeSlugList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Détecte un changement métier sur `row` même si l’objet référence diffère. */
function serviceBlockRowFingerprint(row: DailyServiceRow): string {
  return [
    row.dateIso,
    row.client,
    row.type,
    row.sheetAssignee,
    row.driverInfo,
    row.tel,
    row.vol,
    row.rdv1,
    row.rdv2,
    row.destProv,
  ].join("\u0001");
}

async function planningServicesFetcher(
  url: string
): Promise<PlanningServicesPayload> {
  const res = await fetch(url);
  const data: unknown = await res.json();
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Impossible de charger le planning.";
    throw new Error(msg);
  }
  return data as PlanningServicesPayload;
}

/** ETA chauffeur (départs) — time picker natif, style Midnight Gold. */
function DepartureEtaButton({
  etaHHMM,
  onCommit,
}: {
  etaHHMM: string | null;
  onCommit: (hhmm: string | null) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = etaHHMM ? `ETA: ${etaHHMM}` : "ETA: --:--";
  return (
    <>
      <input
        ref={inputRef}
        type="time"
        step={60}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = "";
          if (!v) return;
          await onCommit(v);
        }}
      />
      <button
        type="button"
        className={cn(
          "shrink-0 rounded-xl border-2 border-[#D4AF37] bg-[#D4AF37] px-4 py-2.5 text-base font-bold text-[#0a192f]",
          "shadow-md transition-[transform,box-shadow] hover:bg-[#D4AF37]/90 active:scale-[0.98]"
        )}
        style={{ touchAction: "manipulation" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const el = inputRef.current;
          if (!el) return;
          const anyEl = el as HTMLInputElement & { showPicker?: () => void };
          if (typeof anyEl.showPicker === "function") {
            try {
              anyEl.showPicker();
              return;
            } catch {
              /* fallback */
            }
          }
          el.click();
        }}
      >
        {label}
      </button>
    </>
  );
}

type ServiceBlockProps = {
  row: DailyServiceRow;
  rowKey: string;
  reportServiceId: string;
  assignees: string[];
  /** Profil courant (« S’enregistrer »), pour permissions photo / PEC. */
  meName: string;
  onAssigneesChange: (
    key: string,
    next: string[],
    options?: { persist?: boolean }
  ) => void;
  hasTimeConflict?: boolean;
  showConflictUi?: boolean;
  isReportCompleted: boolean;
  isPec: boolean;
  hasPhoto: boolean;
  /** Miniature après prise de vue (image déjà redressée côté client). */
  servicePhotoPreviewUrl?: string | null;
  onTogglePec: (opts: { serviceId: string; next: boolean }) => Promise<void>;
  onCapturePhoto: (opts: {
    serviceId: string;
    row: DailyServiceRow;
    file: File;
  }) => Promise<void>;
  onOpenReportForm: (opts: { serviceId: string }) => Promise<void>;
  onDownloadReportPdf: (opts: { serviceId: string }) => Promise<void>;
  onDeleteReport: (opts: { serviceId: string }) => Promise<void>;
  /** Hors administrateurs : assignations visibles mais non modifiables. */
  planningReadOnly: boolean;
  /** Heure d’arrivée (HH:mm) — colonne `eta_time` de `planning_assignments` (Realtime avec les agents). */
  serviceEtaHHMM?: string | null;
  onEtaCommit?: (
    serviceId: string,
    serviceDateIso: string,
    hhmm: string | null
  ) => Promise<void>;
};

function serviceBlockMemoAreEqual(
  prev: Readonly<ServiceBlockProps>,
  next: Readonly<ServiceBlockProps>
): boolean {
  if (prev.rowKey !== next.rowKey) return false;
  if (prev.reportServiceId !== next.reportServiceId) return false;
  if (prev.serviceEtaHHMM !== next.serviceEtaHHMM) return false;
  if (prev.onEtaCommit !== next.onEtaCommit) return false;
  if (prev.meName !== next.meName) return false;
  if (prev.planningReadOnly !== next.planningReadOnly) return false;
  if (prev.hasTimeConflict !== next.hasTimeConflict) return false;
  if (prev.showConflictUi !== next.showConflictUi) return false;
  if (prev.isReportCompleted !== next.isReportCompleted) return false;
  if (prev.isPec !== next.isPec) return false;
  if (prev.hasPhoto !== next.hasPhoto) return false;
  if (prev.servicePhotoPreviewUrl !== next.servicePhotoPreviewUrl) return false;
  if (serviceBlockRowFingerprint(prev.row) !== serviceBlockRowFingerprint(next.row)) {
    return false;
  }
  if (!sameAssigneeSlugList(prev.assignees, next.assignees)) return false;
  return true;
}

/** Police : meilleur rendu des emojis sur iOS / Android. */
const ASSIGNEE_SELECT_EMOJI_FONT =
  "[font-family:system-ui,-apple-system,'Segoe_UI_Emoji','Apple_Color_Emoji',sans-serif]";

const URGENT_ASSIGNEE = PLANNING_URGENT_ASSIGNEE_SLUG;

function ServiceBlockInner({
  row,
  rowKey,
  reportServiceId,
  assignees: assigneesRaw,
  meName,
  onAssigneesChange,
  hasTimeConflict = false,
  showConflictUi = false,
  isReportCompleted,
  isPec,
  hasPhoto,
  servicePhotoPreviewUrl = null,
  onTogglePec,
  onCapturePhoto,
  onOpenReportForm,
  onDownloadReportPdf,
  onDeleteReport,
  planningReadOnly,
  serviceEtaHHMM = null,
  onEtaCommit,
}: ServiceBlockProps) {
  const assignees = Array.isArray(assigneesRaw) ? assigneesRaw : [];
  const isUrgent = assignees.some((a) => isUrgentAssignee(a));
  const fileRef = useRef<HTMLInputElement>(null);
  const assigneesSectionRef = useRef<HTMLDivElement>(null);
  /**
   * Flux « + » local (`isAddingAssignee`) : tant qu’actif, un arrivage Realtime (`assignees`) ne peut
   * pas rabattre le nombre de lignes ni fermer la session d’ajout.
   */
  const [isAddingAssignee, setIsAddingAssignee] = useState(false);
  /** Hauteur locale des lignes d’assignation (indépendante des re-render parent hors `rowKey`). */
  const [assigneeSlotFloor, setAssigneeSlotFloor] = useState(assignees.length);
  /** Après clic « + », focus/autoFocus du dernier sélecteur (mobile : clavier). */
  const [pendingAssigneeSelectAutoFocus, setPendingAssigneeSelectAutoFocus] =
    useState(false);
  /**
   * Nombre minimal de lignes «  forcées » par l’UI au clic (+), indépendamment des props retardées ;
   * recalée à 0 dès que `assignees.length` rattrape.
   */
  const [survivalAssigneeSlots, setSurvivalAssigneeSlots] = useState(0);
  /** Dest./prov. + téléphone — repli Midnight Gold. */
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setIsAddingAssignee(false);
    setAssigneeSlotFloor(assignees.length);
    setSurvivalAssigneeSlots(0);
    setPendingAssigneeSelectAutoFocus(false);
  }, [rowKey]);

  useEffect(() => {
    if (isAddingAssignee) return;
    if (assignees.length > assigneeSlotFloor) {
      setAssigneeSlotFloor(assignees.length);
    }
  }, [isAddingAssignee, assignees.length, assigneeSlotFloor]);

  useEffect(() => {
    if (isAddingAssignee) return;
    if (assignees.length < assigneeSlotFloor) {
      setAssigneeSlotFloor(assignees.length);
    }
  }, [isAddingAssignee, assignees.length, assigneeSlotFloor]);

  useEffect(() => {
    if (assignees.length >= assigneeSlotFloor) {
      setIsAddingAssignee(false);
    }
  }, [assignees.length, assigneeSlotFloor]);

  useEffect(() => {
    if (survivalAssigneeSlots <= 0) return;
    if (assignees.length >= survivalAssigneeSlots) {
      setSurvivalAssigneeSlots(0);
    }
  }, [assignees.length, survivalAssigneeSlots]);

  const assigneeRowCount = Math.min(
    MAX_PLANNING_ASSIGNEES_PER_SERVICE,
    Math.max(
      assignees.length,
      assigneeSlotFloor,
      survivalAssigneeSlots
    )
  );

  useLayoutEffect(() => {
    if (!pendingAssigneeSelectAutoFocus || planningReadOnly) return;
    const root = assigneesSectionRef.current;
    if (!root) return;
    const triggers = root.querySelectorAll('[data-slot=select-trigger]');
    const last = triggers.item(triggers.length - 1);
    const el = last instanceof HTMLElement ? last : null;
    if (el) {
      queueMicrotask(() => {
        el.focus({ preventScroll: true });
      });
    }
  }, [
    pendingAssigneeSelectAutoFocus,
    assigneeRowCount,
    planningReadOnly,
    assignees.length,
    assigneeSlotFloor,
  ]);

  useEffect(() => {
    if (!pendingAssigneeSelectAutoFocus) return;
    const id = requestAnimationFrame(() => {
      setPendingAssigneeSelectAutoFocus(false);
    });
    return () => cancelAnimationFrame(id);
  }, [pendingAssigneeSelectAutoFocus, assigneeRowCount]);

  const updateSlot = (slot: number, value: string) => {
    const next = [...assignees];
    while (next.length <= slot) {
      next.push(DEFAULT_PLANNING_ASSIGNEE_SLUG);
    }
    next[slot] = normalizeAssigneeStoredValue(value);
    onAssigneesChange(rowKey, next);
  };

  const handleAddAssignee = () => {
    try {
      console.log("CLIC PLUS DETECTÉ");
      if (!row || !rowKey?.trim?.() || !reportServiceId?.trim?.()) {
        console.error("handleAddAssignee: ligne ou identifiants invalides.", {
          row,
          rowKey,
          reportServiceId,
        });
        return;
      }
      if (assigneeRowCount >= MAX_PLANNING_ASSIGNEES_PER_SERVICE) return;
      if (!PLANNING_ASSIGNEE_OPTIONS?.length) {
        console.error("handleAddAssignee: liste des agents indisponible.");
        return;
      }

      const baseSlots: string[] = [...assignees];
      const draftNextSlots: string[] = [
        ...baseSlots,
        DEFAULT_PLANNING_ASSIGNEE_SLUG,
      ];

      /** Tout synchrone avant tout effet parent / API async. */
      const nextLen = draftNextSlots.length;
      setSurvivalAssigneeSlots((s) =>
        Math.min(MAX_PLANNING_ASSIGNEES_PER_SERVICE, Math.max(s, nextLen))
      );
      setIsAddingAssignee(true);
      setPendingAssigneeSelectAutoFocus(true);
      setAssigneeSlotFloor((f) =>
        Math.min(MAX_PLANNING_ASSIGNEES_PER_SERVICE, Math.max(f, nextLen))
      );
      /** + : uniquement brouillon local (`__none__`), pas d’API tant qu’on n’a pas choisi un nom. */
      onAssigneesChange(rowKey, draftNextSlots, { persist: false });
    } catch (error) {
      logErreurSupabase({ stage: "handleAddAssignee (sync)", error });
      console.error(error);
    }
  };

  const removeRow = (slot: number) => {
    if (assigneeRowCount <= 1) return;
    if (slot >= assignees.length) {
      setAssigneeSlotFloor((f) =>
        Math.max(1, Math.max(assignees.length, f - 1))
      );
      return;
    }
    if (assignees.length <= 1) return;
    onAssigneesChange(
      rowKey,
      assignees.filter((_, i) => i !== slot)
    );
  };

  const destProv = row.destProv.trim();
  const typeLine = row.type.trim();
  const driverDetails = row.driverInfo.trim();

  const ASSIGN_GREEN =
    "rounded-full bg-white px-2 py-0.5 text-base font-bold text-[#065f46] border border-emerald-600/30";

  const primaryAssigneeLabel = useMemo(() => {
    for (const slug of assignees) {
      const label = assigneeSlugToNotifyLabel(slug);
      if (label) return label;
    }
    return null;
  }, [assignees]);

  const reportKind = useMemo(
    () => detectServiceReportKind(row.type),
    [row.type]
  );
  const showDepartureEta = reportKind === "departure" && typeof onEtaCommit === "function";
  const showPhotoCapture = reportKind !== "departure";

  const handleDepartureEtaCommit = useCallback(
    async (hhmm: string | null) => {
      await onEtaCommit?.(reportServiceId, row.dateIso, hhmm);
    },
    [onEtaCommit, reportServiceId, row.dateIso]
  );

  const hasNamedAssignee = useMemo(
    () => assignees.some((s) => assigneeSlugToNotifyLabel(s) != null),
    [assignees]
  );

  /** Photo / PEC : tout le monde suit cette règle — assigné(s) réel(s) uniquement ; si aucun, ouvert à tous. */
  const canAction = useMemo(() => {
    if (!hasNamedAssignee) return true;
    const me = meName.trim();
    if (!me) return false;
    return assignees.some((s) => {
      const label = assigneeSlugToNotifyLabel(s);
      return label != null && planningDisplayNameEquals(label, me);
    });
  }, [assignees, hasNamedAssignee, meName]);

  const ensureSelfAssignedIfUnassigned = useCallback(() => {
    if (planningReadOnly) return;
    if (hasNamedAssignee) return;
    const me = meName.trim();
    if (!me) return;
    const slug = assigneeSlugFromNotifyLabel(me);
    if (!slug) return;
    onAssigneesChange(rowKey, [slug]);
  }, [hasNamedAssignee, meName, onAssigneesChange, planningReadOnly, rowKey]);

  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [lockedHintVisible, setLockedHintVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = null;
      }
      if (lockedHintTimerRef.current) {
        clearTimeout(lockedHintTimerRef.current);
        lockedHintTimerRef.current = null;
      }
    };
  }, []);

  const showCopyToast = useCallback(() => {
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastVisible(false);
      copyToastTimerRef.current = null;
    }, 2500);
  }, []);

  const showLockedHint = useCallback(() => {
    setLockedHintVisible(true);
    if (lockedHintTimerRef.current) clearTimeout(lockedHintTimerRef.current);
    lockedHintTimerRef.current = setTimeout(() => {
      setLockedHintVisible(false);
      lockedHintTimerRef.current = null;
    }, 2200);
  }, []);

  const handleCopyServiceDetails = useCallback(async () => {
    const text = buildServiceDetailsClipboardText(row);
    try {
      await navigator.clipboard.writeText(text);
      showCopyToast();
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showCopyToast();
      } catch {
        window.alert("Copie impossible. Vérifiez les permissions du navigateur.");
      }
    }
  }, [row, showCopyToast]);

  const copyToast =
    copyToastVisible ? (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background shadow-lg"
      >
        Détails copiés !
      </div>
    ) : null;

  const lockedActionHint =
    lockedHintVisible ? (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute bottom-14 right-3 z-20 max-w-[min(18rem,calc(100%-1.5rem))] rounded-lg border border-amber-500/35 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 shadow-md dark:border-amber-400/30 dark:bg-amber-950/60 dark:text-amber-50"
      >
        Réservé à l’agent assigné. Utilisez « S’enregistrer » si besoin.
      </div>
    ) : null;

  if (isReportCompleted) {
    return (
      <div
        data-planning-service-card
        className={cn(
          "relative mb-6 w-full max-w-4xl last:mb-0 md:mx-auto rounded-xl border-2 bg-gradient-to-br from-[#0f172a] to-[#1e293b] px-4 py-4 shadow-lg -mx-1 sm:mx-auto sm:px-5 sm:py-5",
          isUrgent ? "border-red-600" : "border-[#D4AF37]",
          isUrgent
            ? "shadow-[0_0_0_2px_rgba(212,175,55,0.25)]"
            : "",
          hasTimeConflict &&
            showConflictUi &&
            "ring-2 ring-red-500/60"
        )}
      >
        {hasTimeConflict && showConflictUi ? (
          <div
            className="mb-3 flex items-center gap-1.5 text-xs font-medium text-red-200"
            role="status"
          >
            <span aria-hidden>⚠️</span>
            <span>Conflit horaire</span>
          </div>
        ) : null}

        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-200">
            Assigné
          </div>
          <div className="mt-1">
            {primaryAssigneeLabel ? (
              <span className="inline-flex items-center rounded-full bg-transparent px-2.5 py-1 text-base font-extrabold text-[#D4AF37] border border-[#D4AF37]/70">
                {primaryAssigneeLabel}
              </span>
            ) : (
              <span className="text-sm font-semibold text-white">—</span>
            )}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h2 className="min-w-0 text-xl font-bold leading-snug tracking-tight text-white">
              <PlanningPhoneRichText
                text={row.client.trim() || "—"}
                tone="inherit"
              />{" "}
              ✅
            </h2>
            {showDepartureEta ? (
              <DepartureEtaButton
                etaHHMM={serviceEtaHHMM}
                onCommit={handleDepartureEtaCommit}
              />
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 touch-manipulation border border-[#D4AF37]/60 bg-transparent text-[#D4AF37] shadow-none hover:bg-white/5"
            style={{ touchAction: "manipulation" }}
            title="Copier les détails"
            aria-label="Copier les détails du service"
            onClick={() => {
              void handleCopyServiceDetails();
            }}
          >
            <Copy className="size-4 text-[#D4AF37]" aria-hidden />
          </Button>
        </div>

        <div className="flex items-stretch gap-2">
          <Button
            type="button"
            className="flex-1 border border-[#D4AF37]/60 bg-transparent text-white hover:bg-white/5"
            onClick={() => {
              onDownloadReportPdf({ serviceId: reportServiceId }).catch((e) => {
                console.error(e);
                window.alert(
                  e instanceof Error ? e.message : "Téléchargement impossible."
                );
              });
            }}
          >
            Télécharger le PDF
          </Button>
          {!planningReadOnly ? (
            <Button
              type="button"
              variant="outline"
              className="w-12 shrink-0 border border-[#D4AF37]/60 bg-transparent text-[#D4AF37] hover:bg-white/5"
              aria-label="Supprimer le rapport"
              onClick={() => {
                const ok = window.confirm(
                  "Voulez-vous supprimer ce rapport et recommencer ?"
                );
                if (!ok) return;
                onDeleteReport({ serviceId: reportServiceId }).catch((e) => {
                  console.error(e);
                  window.alert(
                    e instanceof Error ? e.message : "Suppression impossible."
                  );
                });
              }}
            >
              🗑️
            </Button>
          ) : null}
        </div>
        {copyToast}
      </div>
    );
  }

  return (
    <div
      data-planning-service-card
      className={cn(
        "relative mb-6 w-full max-w-4xl last:mb-0 md:mx-auto rounded-xl border-2 bg-gradient-to-br from-[#0f172a] to-[#1e293b] px-4 py-4 shadow-lg -mx-1 sm:mx-auto sm:px-5 sm:py-5 text-white",
        isUrgent ? "border-red-600" : "border-[#D4AF37]",
        isUrgent ? "shadow-[0_0_0_2px_rgba(212,175,55,0.25)]" : "",
        hasTimeConflict &&
          showConflictUi &&
          "ring-2 ring-red-500/60"
      )}
    >
      {hasTimeConflict && showConflictUi ? (
        <div
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-red-200"
          role="status"
        >
          <span aria-hidden>⚠️</span>
          <span>Conflit horaire</span>
        </div>
      ) : null}
      <div className="mb-5" aria-busy={isAddingAssignee}>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-200">
          Assignation
        </span>
        <div
          ref={assigneesSectionRef}
          className="flex flex-col gap-2 sm:gap-2.5"
        >
          {Array.from({ length: assigneeRowCount }, (_, slot) => {
            const rawSlot =
              assignees[slot] ?? DEFAULT_PLANNING_ASSIGNEE_SLUG;
            const assignee = PLANNING_ASSIGNEE_OPTIONS.some(
              (opt) => opt.value === rawSlot
            )
              ? rawSlot
              : DEFAULT_PLANNING_ASSIGNEE_SLUG;
            const triggerDisplayText =
              assignee === PLANNING_URGENT_ASSIGNEE_SLUG
                ? PLANNING_URGENT_ASSIGNEE_DISPLAY
                : PLANNING_ASSIGNEE_OPTIONS.find((opt) => opt.value === assignee)
                    ?.label || assignee;
            const showRemoveLine = slot > 0 && !planningReadOnly;
            const canAddMore =
              !planningReadOnly &&
              slot === 0 &&
              assigneeRowCount < MAX_PLANNING_ASSIGNEES_PER_SERVICE;
            const highlightAssignee = isAssigneeHighlighted(assignee);

            return (
              <div
                key={slot}
                className="flex flex-row flex-nowrap items-center gap-2"
              >
                <div className="min-w-0 w-full max-w-[200px] flex-1 sm:max-w-[200px]">
                  <Select
                    value={assignee}
                    onValueChange={(v) =>
                      updateSlot(slot, v ?? DEFAULT_ASSIGNEE)
                    }
                    disabled={planningReadOnly}
                  >
                    <SelectTrigger
                      size="sm"
                      disabled={planningReadOnly}
                      autoFocus={
                        pendingAssigneeSelectAutoFocus &&
                        slot === assigneeRowCount - 1 &&
                        !planningReadOnly
                      }
                      className={cn(
                        "h-8 w-full justify-start gap-2 border border-[#D4AF37]/60 bg-transparent text-sm shadow-none text-[#D4AF37] font-extrabold",
                        ASSIGNEE_SELECT_EMOJI_FONT,
                        assignee === PLANNING_URGENT_ASSIGNEE_SLUG &&
                          "[&_[data-slot=select-value]]:overflow-visible [&_[data-slot=select-value]]:[line-clamp:unset]"
                      )}
                      aria-label={`Assigné à : ${triggerDisplayText}`}
                    >
                      {highlightAssignee ? (
                        <UserCircle
                          className={cn(
                            "size-4 shrink-0",
                            "text-[#D4AF37]"
                          )}
                          aria-hidden
                        />
                      ) : null}
                      {/* Pas de <SelectValue /> : Base UI afficherait la value brute (emoji_alert). */}
                      <span
                        data-slot="select-value"
                        className={cn(
                          "select-value flex min-h-0 flex-1",
                          assignee === PLANNING_URGENT_ASSIGNEE_SLUG
                            ? "select-value--urgent items-center justify-center overflow-visible text-center text-lg leading-none tracking-tight whitespace-nowrap [line-clamp:unset]"
                            : "min-w-0 truncate text-left text-[#D4AF37] font-extrabold",
                          highlightAssignee && "text-[#D4AF37] font-extrabold"
                        )}
                      >
                        {assignee === PLANNING_URGENT_ASSIGNEE_SLUG
                          ? PLANNING_URGENT_ASSIGNEE_DISPLAY
                          : PLANNING_ASSIGNEE_OPTIONS.find(
                              (opt) => opt.value === assignee
                            )?.label || assignee}
                      </span>
                    </SelectTrigger>
                    <SelectContent
                      className={cn(
                        "z-50 max-h-72 border border-[#D4AF37]/50 bg-[#0a192f] text-white",
                        ASSIGNEE_SELECT_EMOJI_FONT
                      )}
                    >
                      {PLANNING_ASSIGNEE_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          className={
                            opt.value === PLANNING_URGENT_ASSIGNEE_SLUG
                              ? "py-2.5 text-base leading-none focus:bg-white/10 focus-visible:bg-white/10"
                              : undefined
                          }
                        >
                          <span
                            className={
                              opt.value === PLANNING_URGENT_ASSIGNEE_SLUG
                                ? "inline-block text-lg tracking-tight"
                                : undefined
                            }
                          >
                            {opt.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canAddMore ? (
                  <button
                    type="button"
                    className={cn(
                      "relative z-50 pointer-events-auto shrink-0 self-center",
                      "inline-flex size-8 items-center justify-center rounded-lg border border-dashed border-input",
                      "border-[#D4AF37]/70 bg-transparent text-[#D4AF37] shadow-none touch-manipulation outline-none",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    )}
                    style={{ touchAction: "manipulation" }}
                    aria-label="Ajouter un assigné"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddAssignee();
                    }}
                  >
                    <Plus className="size-4 text-[#D4AF37]" aria-hidden />
                  </button>
                ) : null}
                {slot === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0 self-center rounded-lg border border-[#D4AF37]/60 bg-transparent text-[#D4AF37] shadow-none touch-manipulation hover:bg-white/5"
                    style={{ touchAction: "manipulation" }}
                    title="Copier les détails"
                    aria-label="Copier les détails du service"
                    onClick={() => {
                      void handleCopyServiceDetails();
                    }}
                  >
                    <Copy className="size-4 text-[#D4AF37]" aria-hidden />
                  </Button>
                ) : null}
                {showRemoveLine ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(
                      "h-8 w-8 shrink-0 self-center rounded-md border border-[#D4AF37]/60 text-[#D4AF37] shadow-none",
                      "touch-manipulation transition-[color,background-color,transform,box-shadow]",
                      "hover:bg-white/5",
                      "active:scale-[0.96] active:bg-white/10",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    )}
                    style={{ touchAction: "manipulation" }}
                    onClick={() => removeRow(slot)}
                    aria-label="Supprimer cette ligne d’assignation"
                  >
                    <X className="size-4 shrink-0 text-[#D4AF37]" aria-hidden />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-bold leading-snug tracking-tight text-white">
            <PlanningPhoneRichText text={row.client.trim() || "—"} tone="inherit" />
            {isPec ? " 🟠" : ""}
          </h2>
          {showDepartureEta ? (
            <DepartureEtaButton
              etaHHMM={serviceEtaHHMM}
              onCommit={handleDepartureEtaCommit}
            />
          ) : null}
        </div>

        {showPhotoCapture ? (
          <div
            className={cn(
              "mb-2 flex flex-wrap items-center gap-2",
              !canAction && "opacity-45"
            )}
          >
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs font-medium text-foreground",
                "active:scale-[0.98] transition-transform",
                !canAction && "cursor-not-allowed"
              )}
              onClick={() => {
                if (!canAction) {
                  showLockedHint();
                  return;
                }
                ensureSelfAssignedIfUnassigned();
                fileRef.current?.click();
              }}
              aria-label={hasPhoto ? "Photo prise" : "Prendre une photo"}
              aria-disabled={!canAction}
              title={
                !canAction && hasNamedAssignee
                  ? "Réservé à l’agent assigné à ce service"
                  : undefined
              }
            >
              <span aria-hidden>📷</span>
              {hasPhoto ? <span aria-hidden>✅</span> : null}
            </button>
            {hasPhoto && servicePhotoPreviewUrl ? (
              <img
                src={servicePhotoPreviewUrl}
                alt="Aperçu de la photo du service"
                className="h-14 w-14 shrink-0 rounded-md border border-[#D4AF37]/40 object-cover object-center"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!canAction) {
                  showLockedHint();
                  e.currentTarget.value = "";
                  return;
                }
                ensureSelfAssignedIfUnassigned();
                onCapturePhoto({ serviceId: reportServiceId, row, file: f }).catch(
                  (err) => {
                    console.error(err);
                    window.alert(
                      err instanceof Error
                        ? err.message
                        : "Upload photo impossible."
                    );
                  }
                );
                e.currentTarget.value = "";
              }}
            />
          </div>
        ) : null}

        <p className="mb-3 text-sm leading-relaxed text-white">
          <span className="inline-flex items-center gap-3">
            <span className="font-semibold text-slate-200">
              Type :{" "}
            </span>
            <PlanningPhoneRichText text={typeLine || "—"} tone="inherit" />
            <span className="relative inline-flex items-center">
              <label
                className={cn(
                  "inline-flex items-center gap-2 text-xs font-medium text-slate-200",
                  !canAction && "opacity-45"
                )}
                title={
                  !canAction && hasNamedAssignee
                    ? "Réservé à l’agent assigné à ce service"
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-500 disabled:opacity-70"
                  checked={Boolean(isPec)}
                  disabled={!canAction}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!canAction) {
                      showLockedHint();
                      return;
                    }
                    if (next) ensureSelfAssignedIfUnassigned();
                    onTogglePec({ serviceId: reportServiceId, next }).catch(
                      (err) => {
                        console.error(err);
                        window.alert(
                          err instanceof Error
                            ? err.message
                            : "Mise à jour PEC impossible."
                        );
                      }
                    );
                  }}
                />
                PEC
              </label>
              {!canAction && hasNamedAssignee ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Action réservée à l’agent assigné"
                  className="absolute inset-0 z-[1] cursor-not-allowed rounded-sm"
                  onClick={() => showLockedHint()}
                />
              ) : null}
            </span>
          </span>
        </p>
        <p className="mb-2 text-sm font-medium leading-relaxed text-white">
          <PlanningPhoneRichText text={formatVolRdvLine(row)} tone="inherit" />
        </p>
        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls={`planning-card-details-${reportServiceId}`}
          className={cn(
            "mb-1 inline-flex touch-manipulation items-center gap-1.5 rounded-lg px-1 py-1.5 text-xs font-medium text-[#D4AF37]",
            "transition-colors hover:bg-white/5"
          )}
          style={{ touchAction: "manipulation" }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowDetails((v) => !v);
          }}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-[#D4AF37] transition-transform duration-300 ease-out",
              showDetails && "rotate-180"
            )}
          />
          {showDetails ? "Masquer détails" : "Voir détails"}
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            showDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div
            id={`planning-card-details-${reportServiceId}`}
            className="min-h-0 overflow-hidden"
          >
            <div className="space-y-3 border-t border-[#D4AF37]/30 pt-4 text-sm leading-relaxed text-white">
              <p>
                <span className="font-semibold text-slate-200">
                  Dest. / prov. :{" "}
                </span>
                <PlanningPhoneRichText text={destProv || "—"} tone="inherit" />
              </p>
              <p>
                <span className="font-semibold text-slate-200">
                  {"Tél. : "}
                </span>
                <PlanningPhoneRichText text={row.tel.trim() || "—"} tone="inherit" />
              </p>
            </div>
          </div>
        </div>
        {driverDetails ? (
          <div className="mt-3 text-sm leading-relaxed text-white">
            <span className="font-semibold text-slate-200">Détails : </span>
            <PlanningPhoneRichText text={driverDetails} tone="inherit" />
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-[#D4AF37]/30 pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full border-2 border-[#D4AF37] bg-[#D4AF37] text-[#0a192f] font-bold hover:bg-[#D4AF37]/90"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void onOpenReportForm({ serviceId: reportServiceId }).catch((err) => {
              console.error(err);
              window.alert(
                err instanceof Error
                  ? err.message
                  : "Ouverture du rapport impossible."
              );
            });
          }}
        >
          Faire le rapport
        </Button>
      </div>
      {copyToast}
      {lockedActionHint}
    </div>
  );
}

const ServiceBlock = memo(ServiceBlockInner, serviceBlockMemoAreEqual);

async function fetchReportExistence(opts: {
  spreadsheetId: string;
  serviceIds: string[];
}): Promise<ReportsData> {
  const res = await fetch("/api/service-reports/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Erreur service reports.";
    throw new Error(msg);
  }
  const parsed = data as ReportsData & { photoUrlByServiceId?: unknown };
  if (!parsed.photoUrlByServiceId || typeof parsed.photoUrlByServiceId !== "object") {
    parsed.photoUrlByServiceId = {};
  }
  return parsed as ReportsData;
}

type ReportsData = {
  hasReport: Record<string, boolean>;
  isPecByServiceId: Record<string, boolean>;
  isCompletedByServiceId: Record<string, boolean>;
  hasPhotoByServiceId: Record<string, boolean>;
  /** URL publique de la photo planning (aperçu + PDF) */
  photoUrlByServiceId: Record<string, string | null>;
};

async function sendPushNotification(opts: {
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  const res = await fetch("/api/push/planning-daily-ready", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    let msg = "Envoi impossible.";
    try {
      const j = (await res.json()) as { error?: string };
      if (typeof j?.error === "string") msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

function slugifyForStorageKey(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\\/|:\s]+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function DailyServicesView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setPreparingTomorrow } = usePlanningPreparation();
  const { mutate: globalMutate } = useSWRConfig();

  const mutatePlanningRef = useRef<KeyedMutator<PlanningServicesPayload> | undefined>(
    undefined
  );
  const mutateReportsRef = useRef<KeyedMutator<ReportsData> | undefined>(undefined);
  const mutateAssignmentsRef = useRef<
    KeyedMutator<PlanningAssignmentsPayload> | undefined
  >(undefined);
  const etaSnapshotRef = useRef<Record<string, string | null>>({});
  /** Stabilise les références `string[]` par `rowKey` si les slugs n’ont pas changé (évite rechurn parent). */
  const assigneesListCacheRef = useRef(
    new Map<string, { key: string; list: string[] }>()
  );

  const selectedKeyRef = useRef("");

  const configuredId = useLocalSpreadsheetId();
  const spreadsheetId =
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    configuredId ||
    DEFAULT_PLANNING_SPREADSHEET_ID;

  const [selectedDate, setSelectedDate] = useState(() =>
    formatLocalYmd(new Date())
  );
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [calendarPressed, setCalendarPressed] = useState(false);
  const [meOnly, setMeOnly] = useState(false);
  const [meName, setMeName] = useState<string>("");
  const isPlanningAdmin = usePlanningAdminClient();

  const [isLoading, setIsLoading] = useState(false);
  const planningValidatedBannerTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  /** Relecture localStorage « planning validé pour demain ». */
  const [planningFinalizedBump, setPlanningFinalizedBump] = useState(0);
  /** Bandeau vert après validation. */
  const [planningValidatedBanner, setPlanningValidatedBanner] = useState<
    string | null
  >(null);
  const [conflictRowKeys, setConflictRowKeys] = useState<Set<string>>(
    () => new Set()
  );

  /** Brouillon local : affichage immédiat des lignes d’assignation avant la réponse API. */
  const [assigneesDraftByRowKey, setAssigneesDraftByRowKey] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      const session = readPlanningAuthSession();
      const fromSession = session?.displayName?.trim() ?? "";
      if (fromSession) return fromSession;
      return (
        window.localStorage.getItem(MELTIN_TEAM_REGISTER_NAME_KEY)?.trim() ?? ""
      );
    };
    setMeName(read());

    const onStorage = (e: StorageEvent) => {
      if (
        e.key !== MELTIN_TEAM_REGISTER_NAME_KEY &&
        e.key !== MELTIN_PLANNING_AUTH_SESSION_KEY
      ) {
        return;
      }
      setMeName(read());
    };
    const onCustom = () => setMeName(read());
    const onAuth = () => setMeName(read());

    window.addEventListener("storage", onStorage);
    window.addEventListener(MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT, onCustom);
    window.addEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, onAuth);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
        onCustom
      );
      window.removeEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, onAuth);
    };
  }, []);

  useEffect(() => {
    if (!meName.trim() && meOnly) setMeOnly(false);
  }, [meName, meOnly]);

  const swrKey = `/api/planning-services?spreadsheetId=${encodeURIComponent(
    spreadsheetId
  )}&date=${encodeURIComponent(normalizeCanonicalDateKey(selectedDate))}`;

  const {
    data: planningData,
    error,
    isLoading: planningBootstrapLoading,
    isValidating,
    mutate,
  } = useSWR(swrKey, planningServicesFetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  mutatePlanningRef.current = mutate;

  /** Dernier planning affiché : évite l’écran « Chargement… » pendant un re-render / revalidation. */
  const planningDisplayedRef = useRef<PlanningServicesPayload | undefined>(
    undefined
  );
  if (planningData != null) {
    planningDisplayedRef.current = planningData;
  }
  const planningPayload =
    planningData ?? planningDisplayedRef.current ?? undefined;

  /** Dès qu’on a affiché un planning une fois, on ne remplace plus toute la vue par le loader (Realtime, revalidate, etc.). */
  const planningShellHydratedRef = useRef(false);
  useEffect(() => {
    if (planningPayload != null) planningShellHydratedRef.current = true;
  }, [planningPayload]);

  const showPlanningBlockingLoader =
    !planningShellHydratedRef.current &&
    planningBootstrapLoading &&
    planningPayload == null;

  const selectedKey = normalizeCanonicalDateKey(selectedDate);
  selectedKeyRef.current = selectedKey;
  const todayYmd = normalizeCanonicalDateKey(formatLocalYmd(new Date()));
  const tomorrowYmd = normalizeCanonicalDateKey(
    formatLocalYmd(addDaysLocal(new Date(), 1))
  );
  const isTodaySelected = selectedKey === todayYmd;
  const isTomorrowSelected = selectedKey === tomorrowYmd;
  const isCustomDateSelected = !isTodaySelected && !isTomorrowSelected;

  const serviceIdsForAssignments = useMemo(() => {
    const rows = planningPayload?.rows ?? [];
    return [...new Set(rows.map((r) => serviceReportIdFromRow(r)).filter(Boolean))];
  }, [planningPayload?.rows]);

  const serviceIdsForAssignmentsRef = useRef<string[]>([]);
  serviceIdsForAssignmentsRef.current = serviceIdsForAssignments;

  const loadAssignmentsBatch = useCallback(
    async (
      serviceIds: string[]
    ): Promise<PlanningAssignmentsPayload> => {
      const res = await fetch("/api/planning-assignments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Impossible de charger les assignations.";
        throw new Error(msg);
      }
      const p = json as Partial<PlanningAssignmentsPayload>;
      const assigneesByServiceId =
        p.assigneesByServiceId && typeof p.assigneesByServiceId === "object"
          ? (p.assigneesByServiceId as Record<string, string>)
          : {};
      const etaTimeByServiceId: Record<string, string | null> = {};
      for (const id of serviceIds) {
        etaTimeByServiceId[id] = null;
      }
      const etaSrc = p.etaTimeByServiceId;
      if (etaSrc && typeof etaSrc === "object" && !Array.isArray(etaSrc)) {
        for (const [k, v] of Object.entries(etaSrc as Record<string, unknown>)) {
          etaTimeByServiceId[k] =
            typeof v === "string" && /^\d{2}:\d{2}$/.test(v.trim())
              ? v.trim()
              : null;
        }
      }
      return { assigneesByServiceId, etaTimeByServiceId };
    },
    []
  );

  const assignmentsKey = useMemo(() => {
    if (!spreadsheetId) return null;
    if (serviceIdsForAssignments.length === 0) return null;
    return [
      "planningAssignments",
      spreadsheetId,
      selectedKey,
      serviceIdsForAssignments.join("||"),
    ] as const;
  }, [selectedKey, serviceIdsForAssignments, spreadsheetId]);

  const {
    data: assignmentsData,
    mutate: mutateAssignments,
  } = useSWR<PlanningAssignmentsPayload>(
    assignmentsKey,
    () => loadAssignmentsBatch(serviceIdsForAssignments),
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );
  mutateAssignmentsRef.current = mutateAssignments;

  /** Snapshot pour rollback ETA (sans second fetch SWR). */
  etaSnapshotRef.current = assignmentsData?.etaTimeByServiceId ?? {};

  /**
   * Mise à jour « locale » du cache assignations + ETA (`planning_assignments`).
   * Gère aussi les événements « ETA seule » où `agent_name` est inchangé.
   */
  const mergePlanningAssignmentFromRealtime = useCallback(
    (payload: RealtimePlanningAssignmentPayload) => {
      const del = isRealtimePlanningAssignmentDelete(payload);
      const rec = del ? payload.old : payload.new;
      const parsed = assignmentRowFromRealtimeRecord(rec);
      if (!parsed) return;

      void mutateAssignments(
        (prev) => {
          const allowed = new Set(serviceIdsForAssignmentsRef.current);
          if (!allowed.has(parsed.service_id)) {
            return prev;
          }

          const baseAssign = { ...(prev?.assigneesByServiceId ?? {}) };
          const baseEta = { ...(prev?.etaTimeByServiceId ?? {}) };

          let nextAssignment: string | undefined;
          let nextEta: string | null;

          if (del) {
            nextAssignment = undefined;
            nextEta = null;
          } else {
            const trimmed = parsed.agent_name.trim();
            nextAssignment = trimmed ? parsed.agent_name : undefined;
            nextEta = parsed.etaHHMM;
          }

          const prevAssignment = baseAssign[parsed.service_id];
          const prevEta = baseEta[parsed.service_id] ?? null;

          const assignUnchanged =
            (prevAssignment === undefined && nextAssignment === undefined) ||
            prevAssignment === nextAssignment;
          const etaUnchanged = prevEta === nextEta;

          if (assignUnchanged && etaUnchanged) return prev;

          const nextAssignMap = { ...baseAssign };
          if (nextAssignment === undefined) {
            delete nextAssignMap[parsed.service_id];
          } else {
            nextAssignMap[parsed.service_id] = nextAssignment;
          }

          const nextEtaMap = { ...baseEta, [parsed.service_id]: nextEta };

          return {
            assigneesByServiceId: nextAssignMap,
            etaTimeByServiceId: nextEtaMap,
          };
        },
        { revalidate: false }
      );
    },
    [mutateAssignments]
  );

  /**
   * Source de vérité assignations côté client : Postgres Realtime → cache SWR local uniquement.
   * Pas de `router.refresh()`, pas de refetch qui affiche « Chargement du planning… » depuis ce flux.
   */
  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const topic = `planning_assignments:${slugifyForStorageKey(spreadsheetId)}`;
    const ch = sb
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planning_assignments",
        },
        (payload: RealtimePlanningAssignmentPayload) => {
          mergePlanningAssignmentFromRealtime(payload);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setPlanningAssigneesRealtimeChannel(ch, spreadsheetId);
        }
      });

    return () => {
      setPlanningAssigneesRealtimeChannel(null, null);
      void sb.removeChannel(ch);
    };
  }, [spreadsheetId, mergePlanningAssignmentFromRealtime]);

  const assignees = useMemo(() => {
    const rows = planningPayload?.rows ?? [];
    const mapByServiceId = assignmentsData?.assigneesByServiceId ?? {};
    const cache = assigneesListCacheRef.current;
    const usedKeys = new Set<string>();
    const next: Record<string, string[]> = {};
    for (const row of rows) {
      const rowKey = stableServiceRowKey(row);
      usedKeys.add(rowKey);

      let slugs: string[];
      if (Object.prototype.hasOwnProperty.call(assigneesDraftByRowKey, rowKey)) {
        slugs = normalizeAssigneeListFromStored(assigneesDraftByRowKey[rowKey]);
      } else {
        const serviceId = serviceReportIdFromRow(row);
        const fromDb = mapByServiceId[serviceId];
        if (fromDb) {
          slugs = parseAssigneeNameToSlugs(fromDb);
        } else {
          const label = matchSheetAssigneeToTeamLabel(row.sheetAssignee || "");
          if (label) {
            const slug =
              assigneeSlugFromNotifyLabel(label) ?? DEFAULT_PLANNING_ASSIGNEE_SLUG;
            slugs = normalizeAssigneeListFromStored([
              normalizeAssigneeStoredValue(slug),
            ]);
          } else {
            slugs = [DEFAULT_PLANNING_ASSIGNEE_SLUG];
          }
        }
      }

      const fingerprint = slugs.join("\u0001");
      const cached = cache.get(rowKey);
      if (cached && cached.key === fingerprint) {
        next[rowKey] = cached.list;
      } else {
        cache.set(rowKey, { key: fingerprint, list: slugs });
        next[rowKey] = slugs;
      }
    }
    for (const k of cache.keys()) {
      if (!usedKeys.has(k)) cache.delete(k);
    }
    return next;
  }, [
    assigneesDraftByRowKey,
    assignmentsData?.assigneesByServiceId,
    planningPayload?.rows,
  ]);

  /** Planning déjà validé pour la date « demain » (persisté → pas de mode rouge au refresh). */
  const isTomorrowPlanningFinalized = useMemo(() => {
    void planningFinalizedBump;
    if (typeof window === "undefined") return false;
    return isPlanningFinalizedForServiceDate(tomorrowYmd);
  }, [tomorrowYmd, planningFinalizedBump]);

  const isPrepMode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("mode") === "prep"
      : false;

  /** Nouvelle date ⇒ nouvelle clé SWR : fetch implicite, sans `mutate()` forcé (évite doubles requêtes / flash UI). */
  const selectPlanningDate = useCallback((ymd: string) => {
    setSelectedDate(normalizeCanonicalDateKey(ymd));
  }, []);

  /**
   * `?mode=prep` → active la préparation.
   * `?day=tomorrow` ou `?date=tomorrow` → sélectionne la date de demain.
   * Sur `/` uniquement : nettoie l’URL après `?day=tomorrow` (comportement historique).
   */
  const planningQueryKey = searchParams.toString();
  useEffect(() => {
    const modePrep = searchParams.get("mode") === "prep";
    const tomorrowQ =
      searchParams.get("day") === "tomorrow" ||
      searchParams.get("date") === "tomorrow";
    const tomorrowKey = normalizeCanonicalDateKey(
      formatLocalYmd(addDaysLocal(new Date(), 1))
    );

    if (modePrep && isPlanningFinalizedForServiceDate(tomorrowKey)) {
      try {
        router.replace("/planning?date=tomorrow");
      } catch {
        /* noop */
      }
      return;
    }

    if (!modePrep && !tomorrowQ) return;

    if (modePrep) setPreparingTomorrow(true);
    if (tomorrowQ) {
      setSelectedDate(tomorrowKey);
    }
    if (pathname === "/" && searchParams.get("day") === "tomorrow") {
      router.replace("/", { scroll: false });
    }
  }, [planningQueryKey, pathname, router, setPreparingTomorrow]);

  /** Sans `mode=prep` dans l’URL, le contexte « préparation » doit être faux. */
  useEffect(() => {
    if (searchParams.get("mode") !== "prep") {
      setPreparingTomorrow(false);
    }
  }, [searchParams, setPreparingTomorrow]);

  /** Mode préparation réservé aux administrateurs (URL nettoyée si accès direct). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("mode") !== "prep") return;
    if (isPlanningAdmin) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("mode");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [isPlanningAdmin, pathname, router, searchParams]);

  /** Après validation + rechargement complet, réaffiche le bandeau vert une fois. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("meltin_planning_validated_flash") === "1") {
        sessionStorage.removeItem("meltin_planning_validated_flash");
        setPlanningValidatedBanner("Planning validé et équipe notifiée.");
        if (planningValidatedBannerTimerRef.current) {
          clearTimeout(planningValidatedBannerTimerRef.current);
        }
        planningValidatedBannerTimerRef.current = setTimeout(() => {
          setPlanningValidatedBanner(null);
          planningValidatedBannerTimerRef.current = null;
        }, 5000);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (planningValidatedBannerTimerRef.current) {
        clearTimeout(planningValidatedBannerTimerRef.current);
        planningValidatedBannerTimerRef.current = null;
      }
    };
  }, []);

  const handlePlanningFinished = () => {
    void (async () => {
      const token = readPlanningAuthSession()?.token;
      if (!token) {
        window.alert(
          "Reconnectez-vous pour valider le planning (session requise)."
        );
        return;
      }
      const verify = await fetch("/api/planning-assignees/verify-admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!verify.ok) {
        let msg = "Action réservée aux administrateurs.";
        try {
          const j = (await verify.json()) as { error?: string };
          if (typeof j?.error === "string") msg = j.error;
        } catch {
          /* ignore */
        }
        window.alert(msg);
        return;
      }

      setIsLoading(true);

      // Envoi en arrière-plan sans await pour ne pas bloquer l’UI
      sendPushNotification({
        title: "Planning demain",
        body: "📅 Le planning de demain est disponible ! Vérifiez vos assignations.",
        url: "/planning?date=tomorrow",
      }).catch((err) => console.error("Erreur notif silenciée:", err));

      setIsLoading(false);
      try {
        localStorage.setItem("planning_finalized", "true");
      } catch {
        /* quota / private mode */
      }

      // Sortie du mode préparation après délai fixe (succès ou échec de la notif)
      setTimeout(() => {
        window.location.href =
          window.location.origin + "/planning?date=tomorrow";
      }, 800);
    })();
  };

  /** Déjà filtrées côté API par `?date=` ; garde-fou local si besoin. */
  const filtered = useMemo(() => {
    const rows = planningPayload?.rows ?? [];
    return rows.filter(
      (r) => normalizeCanonicalDateKey(r.dateIso) === selectedKey
    );
  }, [planningPayload?.rows, selectedKey]);

  const visibleRows = useMemo(() => {
    const name = meName.trim();
    if (!meOnly || !name) return filtered;
    return filtered.filter((row) => {
      const rowKey = stableServiceRowKey(row);
      const list = normalizeAssigneeListFromStored(assignees[rowKey]);
      for (const slug of list) {
        const label = assigneeSlugToNotifyLabel(slug);
        if (label && planningDisplayNameEquals(label, name)) return true;
      }
      return false;
    });
  }, [assignees, filtered, meName, meOnly]);

  // Important: on charge les statuts (PEC / completed) pour TOUTE la journée affichée,
  // même si le filtre "Me" est actif (sinon les statuts agents seraient incomplets).
  const serviceIdsForReports = useMemo(() => {
    return filtered.map((r) => serviceReportIdFromRow(r));
  }, [filtered]);

  const reportKey = useMemo(() => {
    if (!spreadsheetId) return null;
    if (serviceIdsForReports.length === 0) return null;
    return ["serviceReports", spreadsheetId, selectedKey, serviceIdsForReports.join("||")] as const;
  }, [spreadsheetId, selectedKey, serviceIdsForReports]);

  const {
    data: reportExistence,
    error: reportExistenceError,
    mutate: mutateReports,
  } = useSWR<ReportsData>(
    reportKey,
    () => fetchReportExistence({ spreadsheetId, serviceIds: serviceIdsForReports }),
    {
      revalidateOnFocus: false,
    }
  );
  mutateReportsRef.current = mutateReports;

  const commitServiceEta = useCallback(
    async (serviceId: string, serviceDateIso: string, hhmm: string | null) => {
      const prev = etaSnapshotRef.current[serviceId] ?? null;
      void mutateAssignments(
        (cur) => ({
          assigneesByServiceId: { ...(cur?.assigneesByServiceId ?? {}) },
          etaTimeByServiceId: {
            ...(cur?.etaTimeByServiceId ?? {}),
            [serviceId]: hhmm,
          },
        }),
        { revalidate: false }
      );

      const res = await fetch("/api/planning-assignments/set-eta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          serviceDate: serviceDateIso,
          eta_time: hhmm,
        }),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        void mutateAssignments(
          (cur) => ({
            assigneesByServiceId: { ...(cur?.assigneesByServiceId ?? {}) },
            etaTimeByServiceId: {
              ...(cur?.etaTimeByServiceId ?? {}),
              [serviceId]: prev,
            },
          }),
          { revalidate: false }
        );
        throw new Error(json?.error ?? "Sauvegarde ETA impossible.");
      }
    },
    [mutateAssignments]
  );

  const onAnyServiceEtaCommit = useCallback(
    async (
      serviceId: string,
      serviceDateIso: string,
      hhmm: string | null
    ) => {
      await commitServiceEta(serviceId, serviceDateIso, hhmm);
    },
    [commitServiceEta]
  );

  /**
   * Secours manuel uniquement : feuille planning / PDF.
   * Les assignations suivent Supabase Realtime — pas de re-fetch automatique forcé sur ce bloc.
   */
  const refreshAll = useCallback(() => {
    void mutatePlanningRef.current?.(undefined, { revalidate: true });
    void mutateReportsRef.current?.(undefined, { revalidate: true });
    void mutateAssignmentsRef.current?.(undefined, { revalidate: true });
  }, []);

  /** Refresh manuel (bouton dans le header). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onForce = () => refreshAll();
    window.addEventListener(FORCE_REFRESH_EVENT, onForce);
    return () => window.removeEventListener(FORCE_REFRESH_EVENT, onForce);
  }, [refreshAll]);

  /** Après retour du rapport : force le re-fetch des statuts PDF. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("meltin_service_report_saved_flash") === "1") {
        sessionStorage.removeItem("meltin_service_report_saved_flash");
        if (reportKey) {
          void globalMutate(reportKey);
        }
      }
    } catch {
      /* ignore */
    }
  }, [globalMutate, reportKey]);

  const isCompletedByServiceId = reportExistence?.isCompletedByServiceId ?? {};
  const isPecByServiceId = reportExistence?.isPecByServiceId ?? {};
  const hasPhotoByServiceId = reportExistence?.hasPhotoByServiceId ?? {};
  const photoUrlByServiceId = reportExistence?.photoUrlByServiceId ?? {};

  const agentLabels = useMemo(() => {
    return PLANNING_ASSIGNEE_OPTIONS.filter(
      (o) =>
        o.value !== "__none__" &&
        o.value !== PLANNING_URGENT_ASSIGNEE_SLUG &&
        o.value !== "subcontracted"
    ).map((o) => o.label);
  }, []);

  type AgentStatus = "red" | "yellow" | "green" | "gray" | "black";

  const agentStatusByLabel = useMemo(() => {
    const out: Record<string, AgentStatus> = {};
    for (const label of agentLabels) out[label] = "black";

    const servicesByAgent = new Map<string, string[]>();
    const reportKindByServiceId = new Map<
      string,
      ReturnType<typeof detectServiceReportKind>
    >();
    for (const row of filtered) {
      const rowKey = stableServiceRowKey(row);
      const list = normalizeAssigneeListFromStored(assignees[rowKey]);
      const serviceId = serviceReportIdFromRow(row);
      reportKindByServiceId.set(
        serviceId,
        detectServiceReportKind(row.type)
      );
      for (const slug of list) {
        const label = assigneeSlugToNotifyLabel(slug);
        if (!label) continue;
        if (!servicesByAgent.has(label)) servicesByAgent.set(label, []);
        servicesByAgent.get(label)!.push(serviceId);
      }
    }

    for (const label of agentLabels) {
      const serviceIds = servicesByAgent.get(label) ?? [];
      if (serviceIds.length === 0) {
        out[label] = "black";
        continue;
      }

      let anyPec = false;
      let anyPhoto = false;
      let anyNotCompleted = false;
      for (const sid of serviceIds) {
        const completed = Boolean(isCompletedByServiceId[sid]);
        const pec = Boolean(isPecByServiceId[sid]);
        const photo = Boolean(hasPhotoByServiceId[sid]);
        const kind = reportKindByServiceId.get(sid) ?? "arrival";
        if (!completed && pec) anyPec = true;
        /** Départs : pas de jaune « photo » (pas de photo planning) ; arrivée / transit : inchangé. */
        if (!completed && photo && kind !== "departure") anyPhoto = true;
        if (!completed) anyNotCompleted = true;
      }

      if (anyPec) out[label] = "red";
      else if (anyPhoto) out[label] = "yellow";
      else if (anyNotCompleted) out[label] = "green";
      else out[label] = "gray";
    }

    return out;
  }, [
    agentLabels,
    assignees,
    filtered,
    isCompletedByServiceId,
    isPecByServiceId,
    hasPhotoByServiceId,
  ]);

  function statusDotClass(status: AgentStatus): string {
    switch (status) {
      case "red":
        return "bg-red-500";
      case "yellow":
        return "bg-amber-400";
      case "green":
        return "bg-emerald-500";
      case "gray":
        return "bg-slate-300 dark:bg-slate-600";
      case "black":
      default:
        return "bg-black dark:bg-neutral-200";
    }
  }

  const togglePec = useCallback(
    async (opts: { serviceId: string; next: boolean; row: DailyServiceRow }) => {
      const kind = detectServiceReportKind(opts.row.type);
      const optimistic = {
        ...(reportExistence ?? {
          hasReport: {},
          isPecByServiceId: {},
          isCompletedByServiceId: {},
          hasPhotoByServiceId: {},
          photoUrlByServiceId: {},
        }),
        isPecByServiceId: {
          ...(reportExistence?.isPecByServiceId ?? {}),
          [opts.serviceId]: opts.next,
        },
      };
      void mutateReports(optimistic, { revalidate: false });

      const body: Record<string, unknown> = {
        spreadsheet_id: spreadsheetId,
        service_id: opts.serviceId,
        service_date: opts.row.dateIso,
        service_client: opts.row.client,
        service_type: opts.row.type,
        report_kind: kind,
        is_pec: opts.next,
      };
      if (kind === "departure") {
        body.meeting_time = opts.next ? formatLocalTimeHHMMSS() : null;
      }

      const res = await fetch("/api/service-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { report?: unknown; error?: string };
      if (!res.ok) {
        void mutateReports();
        throw new Error(json?.error || "Sauvegarde PEC impossible.");
      }
      void mutateReports();
    },
    [detectServiceReportKind, mutateReports, reportExistence, spreadsheetId]
  );

  const capturePhoto = useCallback(
    async (opts: { serviceId: string; row: DailyServiceRow; file: File }) => {
      const kind = detectServiceReportKind(opts.row.type);
      if (kind === "departure") {
        throw new Error("La photo n’est pas disponible pour les départs.");
      }

      const processed = await normalizeServicePhotoForUpload(opts.file);

      const form = new FormData();
      form.set("spreadsheetId", spreadsheetId);
      form.set("serviceId", opts.serviceId);
      form.set("fileName", processed.name);
      form.set("file", processed);

      const res = await fetch("/api/service-photos/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { publicUrl?: string; error?: string };
      if (!res.ok || !json.publicUrl) {
        throw new Error(json?.error || "Upload photo impossible.");
      }

      const optimistic = {
        ...(reportExistence ?? {
          hasReport: {},
          isPecByServiceId: {},
          isCompletedByServiceId: {},
          hasPhotoByServiceId: {},
          photoUrlByServiceId: {},
        }),
        hasPhotoByServiceId: {
          ...(reportExistence?.hasPhotoByServiceId ?? {}),
          [opts.serviceId]: true,
        },
        photoUrlByServiceId: {
          ...(reportExistence?.photoUrlByServiceId ?? {}),
          [opts.serviceId]: json.publicUrl,
        },
      };
      void mutateReports(optimistic, { revalidate: false });

      const save = await fetch("/api/service-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet_id: spreadsheetId,
          service_id: opts.serviceId,
          service_date: opts.row.dateIso,
          service_client: opts.row.client,
          service_type: opts.row.type,
          report_kind: kind,
          photo_url: json.publicUrl,
          meeting_time: formatLocalTimeHHMMSS(),
        }),
      });
      const saveJson = (await save.json()) as { error?: string };
      if (!save.ok) {
        void mutateReports();
        throw new Error(saveJson?.error || "Sauvegarde photo_url impossible.");
      }
      void mutateReports();
    },
    [detectServiceReportKind, mutateReports, reportExistence, spreadsheetId]
  );

  const openReportForm = useCallback(
    async (opts: { serviceId: string }) => {
      const row = filtered.find(
        (r) => serviceReportIdFromRow(r) === opts.serviceId
      );
      if (row) {
        const res = await fetch("/api/service-reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheet_id: spreadsheetId,
            service_id: opts.serviceId,
            service_date: row.dateIso,
            service_client: row.client,
            service_type: row.type,
            report_kind: detectServiceReportKind(row.type),
            end_of_service: formatLocalTimeHHMMSS(),
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(json?.error || "Enregistrement heure de fin impossible.");
        }
        void mutateReports();
      }
      router.push(
        `/rapport/${encodeURIComponent(opts.serviceId)}?spreadsheetId=${encodeURIComponent(
          spreadsheetId
        )}&date=${encodeURIComponent(selectedKey)}`
      );
    },
    [detectServiceReportKind, filtered, mutateReports, router, spreadsheetId, selectedKey]
  );

  const downloadReportPdf = useCallback(
    async (opts: { serviceId: string }) => {
      const res = await fetch(
        `/api/service-reports?spreadsheetId=${encodeURIComponent(
          spreadsheetId
        )}&serviceId=${encodeURIComponent(opts.serviceId)}`
      );
      const json = (await res.json()) as {
        report: ServiceReportRow | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json?.error || "Impossible de charger le rapport.");
      }
      const r = json.report;
      if (!r) throw new Error("Rapport introuvable.");
      const kind =
        r.report_kind === "departure" || r.report_kind === "transit"
          ? r.report_kind
          : "arrival";
      const doc = await generateServiceReportPdf({
        title: "Rapport de service",
        reportKind: kind,
        photoUrl: r.photo_url ?? null,
        serviceClient: r.service_client,
        serviceType: r.service_type,
        serviceDateIso: r.service_date,
        serviceVol: r.service_vol,
        serviceRdv1: r.service_rdv1,
        serviceRdv2: r.service_rdv2,
        serviceDestProv: r.service_dest_prov,
        serviceTel: r.service_tel,
        serviceDriverInfo: r.service_driver_info,
        assigneeName: r.assignee_name,
        meetingTime: r.meeting_time,
        endOfService: r.end_of_service,
        pax: r.pax,
        immigrationSpeed: r.immigration_speed,
        immigrationSecuritySpeed: r.immigration_security_speed,
        comments: r.comments,
      });
      doc.save(
        defaultReportFilename({
          serviceClient: r.service_client,
          serviceDateIso: r.service_date,
        })
      );
    },
    [spreadsheetId]
  );

  const downloadReportPdfAndRefreshStatuses = useCallback(
    async (opts: { serviceId: string }) => {
      await downloadReportPdf(opts);
      void mutateReports();
    },
    [downloadReportPdf, mutateReports]
  );

  const deleteReport = useCallback(
    async (opts: { serviceId: string }) => {
      const base = reportExistence ?? {
        hasReport: {},
        isPecByServiceId: {},
        isCompletedByServiceId: {},
        hasPhotoByServiceId: {},
        photoUrlByServiceId: {},
      };
      const optimistic: ReportsData = {
        ...base,
        hasReport: { ...base.hasReport, [opts.serviceId]: false },
        isPecByServiceId: { ...base.isPecByServiceId, [opts.serviceId]: false },
        isCompletedByServiceId: {
          ...base.isCompletedByServiceId,
          [opts.serviceId]: false,
        },
        hasPhotoByServiceId: {
          ...base.hasPhotoByServiceId,
          [opts.serviceId]: false,
        },
        photoUrlByServiceId: {
          ...(base.photoUrlByServiceId ?? {}),
          [opts.serviceId]: null,
        },
      };
      void mutateReports(optimistic, { revalidate: false });

      const res = await fetch("/api/service-reports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet_id: spreadsheetId,
          service_id: opts.serviceId,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        void mutateReports();
        throw new Error(json?.error || "Suppression impossible.");
      }
      void mutateReports();
    },
    [mutateReports, reportExistence, spreadsheetId]
  );

  /**
   * Conflits (rouge) : uniquement si `mode=prep` dans l’URL (isPrepMode) + demain + pas validé.
   */
  const prepModeActive = Boolean(
    isPrepMode && isTomorrowSelected && !isTomorrowPlanningFinalized
  );

  /** Barre « Planning terminé » : demain + mode préparation dans l’URL (admins). */
  const showPrepModeBar =
    isTomorrowSelected && isPrepMode && isPlanningAdmin;

  useEffect(() => {
    if (!prepModeActive) {
      setConflictRowKeys(new Set());
      return;
    }
    const rowKeysAndRows = visibleRows.map((row) => ({
      rowKey: stableServiceRowKey(row),
      row,
    }));
    setConflictRowKeys(computeConflictRowKeys(rowKeysAndRows, assignees));
  }, [prepModeActive, visibleRows, assignees]);

  const setAssigneesForRow = useCallback(
    (key: string, next: string[], opts?: { persist?: boolean }) => {
      try {
        const persist = opts?.persist !== false;
        const keyTrim = typeof key === "string" ? key.trim() : "";
        if (!keyTrim) {
          console.error("setAssigneesForRow: clé ligne vide ou invalide.");
          return;
        }

        const nextRows = Array.isArray(next)
          ? next
          : next == null
            ? ([] as string[])
            : [];

        let safe = nextRows
          .slice(0, MAX_PLANNING_ASSIGNEES_PER_SERVICE)
          .map((x) => normalizeAssigneeStoredValue(x));
        if (safe.length === 0) safe = [DEFAULT_PLANNING_ASSIGNEE_SLUG];
        safe = normalizeAssigneeListFromStored(safe);

        const assigneesBucket =
          typeof assignees === "object" && assignees !== null ? assignees : {};
        const prevArrSnapshot = normalizeAssigneeListFromStored(
          (assigneesBucket as Record<string, unknown>)[keyTrim]
        );

        setAssigneesDraftByRowKey((prev) => ({ ...prev, [keyTrim]: safe }));

        if (!persist) {
          return;
        }

        void (async () => {
          const clearDraft = () => {
            setAssigneesDraftByRowKey((p) => {
              if (!Object.prototype.hasOwnProperty.call(p, keyTrim)) return p;
              const n = { ...p };
              delete n[keyTrim];
              return n;
            });
          };

          try {
            const rows =
              planningDisplayedRef.current?.rows ??
              planningPayload?.rows ??
              [];
            const row = rows.find((r) => stableServiceRowKey(r) === keyTrim);
            if (!row || !serviceReportIdFromRow(row)?.trim?.()) {
              clearDraft();
              return;
            }

            const token = readPlanningAuthSession()?.token;
            if (!token) {
              window.alert(
                "Reconnectez-vous pour modifier les assignations (session requise)."
              );
              clearDraft();
              return;
            }
            const verify = await fetch("/api/planning-assignees/verify-admin", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!verify.ok) {
              let msg = "Action réservée aux administrateurs.";
              try {
                const j = (await verify.json()) as { error?: string };
                if (typeof j?.error === "string") msg = j.error;
              } catch {
                /* ignore */
              }
              window.alert(msg);
              clearDraft();
              return;
            }

            const prevNotify = new Set(
              prevArrSnapshot.filter(
                (s) =>
                  s !== DEFAULT_PLANNING_ASSIGNEE_SLUG && !isUrgentAssignee(s)
              )
            );
            const hadUrgent = prevArrSnapshot.some((s) => s === URGENT_ASSIGNEE);

            const dateKey = normalizeCanonicalDateKey(selectedDate);
            const planningDay = planningDayBucket(dateKey, todayYmd, tomorrowYmd);

            /** Même valeur que `agent_name` envoyée à Supabase (serializeAssigneeSlugsToName côté `/api/planning-assignees/set`). */
            const agentNameMerged = serializeAssigneeSlugsToName(safe);
            const sidSavedForPost = serviceReportIdFromRow(row);

            const res = await fetch("/api/planning-assignees/set", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                serviceId: sidSavedForPost,
                serviceDate: row.dateIso,
                assigneeSlugs: safe,
              }),
            });

            if (!res.ok) {
              let msg = "Enregistrement impossible.";
              let parsed: unknown = null;
              const rawText = await res.text();
              try {
                parsed = rawText ? JSON.parse(rawText) : null;
              } catch {
                parsed = rawText;
              }
              if (
                parsed &&
                typeof parsed === "object" &&
                "error" in parsed &&
                typeof (parsed as { error?: unknown }).error === "string"
              ) {
                msg = (parsed as { error: string }).error;
              }
              logErreurSupabase({
                stage: "POST /api/planning-assignees/set",
                httpStatus: res.status,
                parsed,
                rawText,
              });
              window.alert(msg);
              clearDraft();
              return;
            }

            await mutateReportsRef.current?.(undefined, { revalidate: true });

            const sidSaved = sidSavedForPost;
            void mutateAssignments(
              (prev) => {
                const baseAssign = prev?.assigneesByServiceId ?? {};
                const baseEta = { ...(prev?.etaTimeByServiceId ?? {}) };
                let nextAssignment: string | undefined;
                if (agentNameMerged == null || !agentNameMerged.trim()) {
                  nextAssignment = undefined;
                } else {
                  nextAssignment = agentNameMerged;
                }
                const prevAssignment = baseAssign[sidSaved];
                const unchanged =
                  (prevAssignment === undefined &&
                    nextAssignment === undefined) ||
                  prevAssignment === nextAssignment;
                if (unchanged) {
                  return {
                    assigneesByServiceId: baseAssign,
                    etaTimeByServiceId: baseEta,
                  };
                }

                const nextMap = { ...baseAssign };
                if (nextAssignment === undefined) {
                  delete nextMap[sidSaved];
                } else {
                  nextMap[sidSaved] = nextAssignment;
                }
                return {
                  assigneesByServiceId: nextMap,
                  etaTimeByServiceId: baseEta,
                };
              },
              { revalidate: false }
            );

            clearDraft();

            // 🚨 Clic alarme (urgence) : déclenche un envoi global immédiat.
            if (safe.includes(URGENT_ASSIGNEE) && !hadUrgent) {
              void fetch("/api/push/planning-alarm-uncovered", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  serviceId: serviceReportIdFromRow(row),
                  rdv: row.rdv1 || row.rdv2 || "",
                }),
              }).catch(() => {});
            }

            const isPrep =
              typeof window !== "undefined" &&
              new URLSearchParams(window.location.search).get("mode") === "prep";
            /** Demain + `mode=prep` : pas de notifs individuelles pendant la préparation. */
            if (dateKey === tomorrowYmd && isPrep) {
              return;
            }
            /** Sans `mode=prep` : notifs pour chaque nouvel assigné ajouté sur la ligne. */
            for (const slug of safe) {
              if (prevNotify.has(slug)) continue;
              const label = assigneeSlugToNotifyLabel(slug);
              if (!label) continue;
              const actorName =
                readPlanningAuthSession()?.displayName?.trim() ?? "";
              void fetch("/api/push/planning-assignee-alert", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  spreadsheetId,
                  dateKey,
                  stableRowKey: keyTrim,
                  assigneeName: label,
                  planningDay,
                  actorName,
                }),
              }).catch(() => {});
            }
          } catch (e) {
            logErreurSupabase({ stage: "setAssigneesForRow (async)", error: e });
            console.error(e);
            setAssigneesDraftByRowKey((p) => {
              if (!Object.prototype.hasOwnProperty.call(p, keyTrim)) return p;
              const n = { ...p };
              delete n[keyTrim];
              return n;
            });
          }
        })();
      } catch (error) {
        logErreurSupabase({ stage: "setAssigneesForRow (sync)", error });
        console.error(error);
      }
    },
    [
      assignees,
      mutateAssignments,
      planningPayload?.rows,
      selectedDate,
      spreadsheetId,
      todayYmd,
      tomorrowYmd,
    ]
  );

  /** Détection d’urgence : nouvelles lignes du jour → 🚨 si pas encore d’assignation (y compris après refresh SWR). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rows = planningPayload?.rows;
    if (!rows?.length) return;

    const todayKey = normalizeCanonicalDateKey(formatLocalYmd(new Date()));
    if (normalizeCanonicalDateKey(selectedDate) !== todayKey) return;

    const identityToStables = new Map<string, Set<string>>();
    for (const row of rows) {
      const id = serviceUrgencyIdentityKey(row);
      const sk = stableServiceRowKey(row);
      if (!identityToStables.has(id)) identityToStables.set(id, new Set());
      identityToStables.get(id)!.add(sk);
    }

    const currentIdentities = [...identityToStables.keys()];

    const snapshots = loadSnapshotStore();
    const prev = snapshots[spreadsheetId]?.[todayKey] ?? [];

    if (prev.length === 0) {
      snapshots[spreadsheetId] = {
        ...(snapshots[spreadsheetId] ?? {}),
        [todayKey]: currentIdentities,
      };
      saveSnapshotStore(snapshots);
      return;
    }

    const prevSet = new Set(prev);
    const newIdentities = currentIdentities.filter((id) => !prevSet.has(id));

    for (const id of newIdentities) {
      for (const stableKey of identityToStables.get(id) ?? []) {
        if (!isPlanningAdmin) continue;
        const current = normalizeAssigneeListFromStored(assignees[stableKey]);
        if (
          current.every((s) => s === DEFAULT_PLANNING_ASSIGNEE_SLUG) &&
          !current.some(isUrgentAssignee)
        ) {
          setAssigneesForRow(stableKey, [URGENT_ASSIGNEE]);
        }
      }
    }

    const mergedIdentities = [...new Set([...prev, ...currentIdentities])];
    snapshots[spreadsheetId] = {
      ...(snapshots[spreadsheetId] ?? {}),
      [todayKey]: mergedIdentities,
    };
    saveSnapshotStore(snapshots);

  }, [
    assignees,
    planningPayload?.rows,
    planningPayload?.fetchedAt,
    isPlanningAdmin,
    selectedDate,
    setAssigneesForRow,
    spreadsheetId,
  ]);

  return (
    <div
      className={cn(
        "relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6",
        showPrepModeBar && "pb-28 sm:pb-24",
        planningValidatedBanner && "pt-10 sm:pt-11"
      )}
    >
      {showPrepModeBar ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 dark:border-amber-400/30 dark:bg-amber-400/10">
          <span className="font-semibold">Mode Préparation</span> : les agents ne
          voient pas encore ces changements (aucune notification envoyée).
        </div>
      ) : null}
      {planningValidatedBanner ? (
        <div
          role="status"
          className="fixed top-14 inset-x-0 z-30 border-b border-emerald-600/30 bg-emerald-600 px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm dark:border-emerald-500/40 dark:bg-emerald-700"
        >
          {planningValidatedBanner}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Planning du jour
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {agentLabels.map((label) => {
              const status = agentStatusByLabel[label] ?? "black";
              return (
                <Badge
                  key={label}
                  variant="outline"
                  className="h-6 gap-2 rounded-full px-2.5 py-1 text-xs"
                >
                  <span
                    className={cn(
                      "inline-block size-2 rounded-full",
                      statusDotClass(status)
                    )}
                    aria-hidden
                  />
                  <span className="truncate max-w-[9rem]">{label}</span>
                </Badge>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <Label id="planning-day-label">Jour affiché</Label>
        <div className="flex flex-row flex-wrap items-stretch gap-3">
          <Button
            type="button"
            variant="ghost"
            className={cn(dateNavButtonClass(isTodaySelected), "h-9")}
            onClick={() => selectPlanningDate(todayYmd)}
          >
            Aujourd’hui
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(dateNavButtonClass(isTomorrowSelected), "h-9")}
            onClick={() => selectPlanningDate(tomorrowYmd)}
          >
            Demain
          </Button>
          {/* input[type=date] au-dessus de l’icône : ouverture native fiable sur iOS (pas seulement onClick → input caché). */}
          <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:h-9 sm:w-9">
            <input
              ref={datePickerRef}
              id="planning-date-picker-input"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const v = e.target.value;
                if (v) selectPlanningDate(v);
              }}
              aria-labelledby="planning-day-label"
              aria-label="Choisir une date dans le calendrier"
              className={cn(
                "absolute inset-0 z-10 box-border h-full w-full max-w-none cursor-pointer opacity-0",
                "touch-manipulation text-base leading-none"
              )}
              style={{ touchAction: "manipulation" }}
              onPointerDown={() => setCalendarPressed(true)}
              onPointerUp={() => setCalendarPressed(false)}
              onPointerLeave={() => setCalendarPressed(false)}
              onPointerCancel={() => setCalendarPressed(false)}
            />
            <div
              aria-hidden
              className={cn(
                "pointer-events-none flex h-full w-full items-center justify-center rounded-lg shadow-none transition-[opacity,transform] duration-150",
                isCustomDateSelected
                  ? "bg-neutral-950 text-white dark:bg-neutral-50 dark:text-neutral-950"
                  : "bg-muted text-foreground",
                calendarPressed && "scale-[0.96] opacity-70"
              )}
            >
              <Calendar className="size-4" />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className={cn(
              dateNavButtonClass(Boolean(meOnly)),
              "relative z-20 h-11 px-4 sm:h-9 sm:px-3",
              !meName.trim() && "opacity-50"
            )}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMeOnly((v) => !v);
            }}
            disabled={!meName.trim()}
            aria-pressed={meOnly}
            title={
              meName.trim()
                ? `Afficher uniquement ${meName.trim()}`
                : "Définissez votre nom via “S'enregistrer”"
            }
          >
            Me
          </Button>
        </div>
      </div>

      {showPlanningBlockingLoader ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Chargement du planning…
        </div>
      ) : error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive"
          role="alert"
        >
          {error instanceof Error ? error.message : "Erreur inconnue."}
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-12 text-center text-muted-foreground">
          {meOnly ? "Aucun service assigné à vous" : "Aucun planning pour cette journée"}
        </p>
      ) : (
        <>
          {reportExistenceError ? (
            <div
              className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {reportExistenceError instanceof Error
                ? reportExistenceError.message
                : "Erreur chargement des rapports."}
            </div>
          ) : null}
          <div className="w-full">
            {visibleRows.map((row) => {
              const rowKey = stableServiceRowKey(row);
              const reportSid = serviceReportIdFromRow(row);
              const assigneeList = normalizeAssigneeListFromStored(
                assignees[rowKey]
              );
              return (
                <ServiceBlock
                  key={reportSid}
                  row={row}
                  rowKey={rowKey}
                  reportServiceId={reportSid}
                  assignees={assigneeList}
                  meName={meName}
                  onAssigneesChange={setAssigneesForRow}
                  hasTimeConflict={conflictRowKeys.has(rowKey)}
                  showConflictUi={prepModeActive}
                  isReportCompleted={Boolean(isCompletedByServiceId[reportSid])}
                  isPec={Boolean(isPecByServiceId[reportSid])}
                  hasPhoto={Boolean(hasPhotoByServiceId[reportSid])}
                  servicePhotoPreviewUrl={
                    photoUrlByServiceId[reportSid] ?? null
                  }
                  onTogglePec={async ({ serviceId, next }) =>
                    togglePec({ serviceId, next, row })
                  }
                  onCapturePhoto={async ({ serviceId, row: r, file }) =>
                    capturePhoto({ serviceId, row: r, file })
                  }
                  onOpenReportForm={openReportForm}
                  onDownloadReportPdf={downloadReportPdfAndRefreshStatuses}
                  onDeleteReport={deleteReport}
                  planningReadOnly={!isPlanningAdmin}
                  serviceEtaHHMM={
                    assignmentsData?.etaTimeByServiceId?.[reportSid] ?? null
                  }
                  onEtaCommit={onAnyServiceEtaCommit}
                />
              );
            })}
          </div>
          {planningPayload?.fetchedAt ? (
            <p
              className={cn(
                "text-center text-xs text-muted-foreground",
                isValidating && "opacity-70"
              )}
            >
              Dernière synchro :{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "short",
                timeStyle: "medium",
              }).format(new Date(planningPayload.fetchedAt))}
              {isValidating ? " · mise à jour…" : ""}
            </p>
          ) : null}
        </>
      )}

      {showPrepModeBar ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 p-4 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-sm",
            "pb-[max(1rem,env(safe-area-inset-bottom))] dark:shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.25)]"
          )}
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Button
              type="button"
              size="lg"
              disabled={isLoading}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePlanningFinished();
              }}
              className="inline-flex w-full gap-2 rounded-xl border shadow-sm sm:w-auto sm:min-w-[280px]"
              variant="default"
            >
              {isLoading ? (
                <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
              ) : null}
              Confirmer et envoyer le planning
            </Button>
            <p className="text-center text-xs text-muted-foreground sm:text-left">
              Notifie toute l’équipe que le planning de demain est prêt.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
