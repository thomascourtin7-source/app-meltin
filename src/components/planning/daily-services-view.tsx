"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  Calendar,
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
  assigneeSlugToNotifyLabel,
  isUrgentAssignee,
  normalizeAssigneeListFromStored,
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
import { detectServiceReportKind } from "@/lib/planning/service-kind";

const POLL_MS = 5 * 60 * 1000;

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

const PLANNING_ASSIGNEES_STORAGE_KEY = "meltin_planning_assignees_v3";

/** Ancienne clé (chaîne unique par ligne) → migrée une fois vers v3. */
const PLANNING_ASSIGNEES_STORAGE_KEY_LEGACY_V2 = "meltin_planning_assignees_v2";

/** Snapshots des identités « vues » par jour (détection des nouvelles lignes). */
const PLANNING_ROW_SNAPSHOT_KEY = "meltin_planning_row_snapshot_v1";

/** Par feuille : par clé de ligne stable, tableau de slugs (1 à 4). */
type AssigneeStore = Record<string, Record<string, string[]>>;

type SnapshotStore = Record<string, Record<string, string[]>>;

function migrateLegacyV2ToV3(
  legacy: Record<string, Record<string, unknown>>
): AssigneeStore {
  const out: AssigneeStore = {};
  for (const [sid, rows] of Object.entries(legacy)) {
    if (!rows || typeof rows !== "object") continue;
    out[sid] = {};
    for (const [rowKey, v] of Object.entries(rows)) {
      out[sid][rowKey] = normalizeAssigneeListFromStored(v);
    }
  }
  return out;
}

function loadAssigneeStore(): AssigneeStore {
  if (typeof window === "undefined") return {};
  try {
    const rawV3 = window.localStorage.getItem(PLANNING_ASSIGNEES_STORAGE_KEY);
    if (rawV3) {
      const parsed: unknown = JSON.parse(rawV3);
      if (!parsed || typeof parsed !== "object") return {};
      return migrateLegacyV2ToV3(parsed as Record<string, Record<string, unknown>>);
    }
    const rawV2 = window.localStorage.getItem(
      PLANNING_ASSIGNEES_STORAGE_KEY_LEGACY_V2
    );
    if (rawV2) {
      const parsed: unknown = JSON.parse(rawV2);
      if (parsed && typeof parsed === "object") {
        const migrated = migrateLegacyV2ToV3(
          parsed as Record<string, Record<string, unknown>>
        );
        window.localStorage.setItem(
          PLANNING_ASSIGNEES_STORAGE_KEY,
          JSON.stringify(migrated)
        );
        return migrated;
      }
    }
    return {};
  } catch {
    return {};
  }
}

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

type ServiceBlockProps = {
  row: DailyServiceRow;
  rowKey: string;
  reportServiceId: string;
  assignees: string[];
  onAssigneesChange: (key: string, next: string[]) => void;
  hasTimeConflict?: boolean;
  showConflictUi?: boolean;
  isReportCompleted: boolean;
  isPec: boolean;
  hasPhoto: boolean;
  onTogglePec: (opts: { serviceId: string; next: boolean }) => Promise<void>;
  onCapturePhoto: (opts: {
    serviceId: string;
    row: DailyServiceRow;
    file: File;
  }) => Promise<void>;
  onOpenReportForm: (opts: { serviceId: string }) => void;
  onDownloadReportPdf: (opts: { serviceId: string }) => Promise<void>;
};

/** Police : meilleur rendu des emojis sur iOS / Android. */
const ASSIGNEE_SELECT_EMOJI_FONT =
  "[font-family:system-ui,-apple-system,'Segoe_UI_Emoji','Apple_Color_Emoji',sans-serif]";

const URGENT_ASSIGNEE = PLANNING_URGENT_ASSIGNEE_SLUG;

function ServiceBlock({
  row,
  rowKey,
  reportServiceId,
  assignees,
  onAssigneesChange,
  hasTimeConflict = false,
  showConflictUi = false,
  isReportCompleted,
  isPec,
  hasPhoto,
  onTogglePec,
  onCapturePhoto,
  onOpenReportForm,
  onDownloadReportPdf,
}: ServiceBlockProps) {
  const isUrgent = assignees.some((a) => isUrgentAssignee(a));
  const fileRef = useRef<HTMLInputElement>(null);

  const updateSlot = (slot: number, value: string) => {
    const next = [...assignees];
    next[slot] = normalizeAssigneeStoredValue(value);
    onAssigneesChange(rowKey, next);
  };

  const addRow = () => {
    if (assignees.length >= MAX_PLANNING_ASSIGNEES_PER_SERVICE) return;
    onAssigneesChange(rowKey, [
      ...assignees,
      DEFAULT_PLANNING_ASSIGNEE_SLUG,
    ]);
  };

  const removeRow = (slot: number) => {
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
    "font-bold text-emerald-900 dark:text-emerald-400";

  return (
    <div
      className={cn(
        "mb-6 w-full max-w-4xl last:mb-0 md:mx-auto rounded-xl border bg-card px-4 py-4 shadow-sm -mx-1 sm:mx-auto sm:px-5 sm:py-5",
        isUrgent
          ? "border-red-300/60 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35"
          : "border-border/50",
        hasTimeConflict &&
          showConflictUi &&
          "bg-red-50 dark:bg-red-950/25"
      )}
    >
      {hasTimeConflict && showConflictUi ? (
        <div
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-red-800 dark:text-red-200"
          role="status"
        >
          <span aria-hidden>⚠️</span>
          <span>Conflit horaire</span>
        </div>
      ) : null}
      <div className="mb-5">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Assignation
        </span>
        <div className="flex flex-col gap-2 sm:gap-2.5">
          {assignees.map((assignee, slot) => {
            const triggerDisplayText =
              assignee === PLANNING_URGENT_ASSIGNEE_SLUG
                ? PLANNING_URGENT_ASSIGNEE_DISPLAY
                : PLANNING_ASSIGNEE_OPTIONS.find((opt) => opt.value === assignee)
                    ?.label || assignee;
            const showRemoveLine = slot > 0;
            const canAddMore =
              slot === 0 &&
              assignees.length < MAX_PLANNING_ASSIGNEES_PER_SERVICE;
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
                  >
                    <SelectTrigger
                      size="sm"
                      className={cn(
                        "h-8 w-full justify-start gap-2 border border-border/50 bg-muted/40 text-sm shadow-none",
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
                            "text-emerald-900 dark:text-emerald-400"
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
                            : "min-w-0 truncate text-left",
                          highlightAssignee && ASSIGN_GREEN
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
                        "z-50 max-h-72",
                        ASSIGNEE_SELECT_EMOJI_FONT
                      )}
                    >
                      {PLANNING_ASSIGNEE_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          className={
                            opt.value === PLANNING_URGENT_ASSIGNEE_SLUG
                              ? "py-2.5 text-base leading-none focus:bg-muted focus-visible:bg-muted"
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0 self-center rounded-lg border-dashed shadow-none touch-manipulation"
                    style={{ touchAction: "manipulation" }}
                    onClick={addRow}
                    aria-label="Ajouter un assigné"
                  >
                    <Plus className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {showRemoveLine ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(
                      "h-8 w-8 shrink-0 self-center rounded-md border-destructive/25 text-destructive shadow-none",
                      "touch-manipulation transition-[color,background-color,transform,box-shadow]",
                      "hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive",
                      "active:scale-[0.96] active:bg-destructive/20",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    )}
                    style={{ touchAction: "manipulation" }}
                    onClick={() => removeRow(slot)}
                    aria-label="Supprimer cette ligne d’assignation"
                  >
                    <X className="size-4 shrink-0" aria-hidden />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-0">
        <h2 className="mb-3 text-xl font-bold leading-snug tracking-tight text-foreground">
          <PlanningPhoneRichText text={row.client.trim() || "—"} />
          {!isReportCompleted && isPec ? " 🟠" : ""}
          {isReportCompleted ? " ✅" : ""}
        </h2>

        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs font-medium text-foreground",
              "active:scale-[0.98] transition-transform"
            )}
            onClick={() => fileRef.current?.click()}
            aria-label={hasPhoto ? "Photo prise" : "Prendre une photo"}
          >
            <span aria-hidden>📷</span>
            {hasPhoto ? <span aria-hidden>✅</span> : null}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
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

        <p className="mb-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <span className="inline-flex items-center gap-3">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Type :{" "}
            </span>
            <PlanningPhoneRichText text={typeLine || "—"} />
            {!isReportCompleted ? (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-500"
                  checked={Boolean(isPec)}
                  onChange={(e) => {
                    const next = e.target.checked;
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
            ) : null}
          </span>
        </p>
        <p className="mb-3 text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200">
          <PlanningPhoneRichText text={formatVolRdvLine(row)} />
        </p>
        <div className="space-y-3 border-t border-border/40 pt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Dest. / prov. :{" "}
            </span>
            <PlanningPhoneRichText text={destProv || "—"} />
          </p>
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {"Tél. : "}
            </span>
            <PlanningPhoneRichText text={row.tel.trim() || "—"} />
          </p>
          {driverDetails ? (
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Détails :{" "}
              </span>
              <PlanningPhoneRichText text={driverDetails} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 border-t border-border/40 pt-4">
        {isReportCompleted ? (
          <Button
            type="button"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600/90 dark:hover:bg-emerald-600"
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
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onOpenReportForm({ serviceId: reportServiceId })}
          >
            Faire le rapport
          </Button>
        )}
      </div>
    </div>
  );
}

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
  return data as ReportsData;
}

type ReportsData = {
  hasReport: Record<string, boolean>;
  isPecByServiceId: Record<string, boolean>;
  isCompletedByServiceId: Record<string, boolean>;
  hasPhotoByServiceId: Record<string, boolean>;
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

  const [assigneesBump, setAssigneesBump] = useState(0);
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

  /** Migration one-shot : normalise les assignations (tableaux / slugs / emojis). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PLANNING_ASSIGNEES_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const store = parsed as AssigneeStore;
      let changed = false;
      for (const sid of Object.keys(store)) {
        const rows = store[sid];
        if (!rows || typeof rows !== "object") continue;
        for (const rowKey of Object.keys(rows)) {
          const v = rows[rowKey];
          const n = normalizeAssigneeListFromStored(v);
          if (JSON.stringify(v) !== JSON.stringify(n)) {
            rows[rowKey] = n;
            changed = true;
          }
        }
      }
      if (changed) {
        window.localStorage.setItem(
          PLANNING_ASSIGNEES_STORAGE_KEY,
          JSON.stringify(store)
        );
        startTransition(() => setAssigneesBump((b) => b + 1));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const assignees = useMemo(() => {
    void assigneesBump;
    if (typeof window === "undefined") return {};
    const sheetMap = loadAssigneeStore()[spreadsheetId];
    if (!sheetMap) return {};
    const next: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(sheetMap)) {
      next[k] = normalizeAssigneeListFromStored(v);
    }
    return next;
  }, [spreadsheetId, assigneesBump]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () =>
      window.localStorage.getItem(MELTIN_TEAM_REGISTER_NAME_KEY)?.trim() ?? "";
    setMeName(read());

    const onStorage = (e: StorageEvent) => {
      if (e.key !== MELTIN_TEAM_REGISTER_NAME_KEY) return;
      setMeName(read());
    };
    const onCustom = () => setMeName(read());

    window.addEventListener("storage", onStorage);
    window.addEventListener(MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT, onCustom);
    };
  }, []);

  useEffect(() => {
    if (!meName.trim() && meOnly) setMeOnly(false);
  }, [meName, meOnly]);

  const swrKey = `/api/planning-services?spreadsheetId=${encodeURIComponent(
    spreadsheetId
  )}&date=${encodeURIComponent(normalizeCanonicalDateKey(selectedDate))}`;

  const { data, error, isLoading: planningDataLoading, isValidating, mutate } =
    useSWR(
    swrKey,
    planningServicesFetcher,
    {
      refreshInterval: POLL_MS,
      revalidateOnFocus: true,
    }
  );

  const selectedKey = normalizeCanonicalDateKey(selectedDate);
  const todayYmd = normalizeCanonicalDateKey(formatLocalYmd(new Date()));
  const tomorrowYmd = normalizeCanonicalDateKey(
    formatLocalYmd(addDaysLocal(new Date(), 1))
  );
  const isTodaySelected = selectedKey === todayYmd;
  const isTomorrowSelected = selectedKey === tomorrowYmd;
  const isCustomDateSelected = !isTodaySelected && !isTomorrowSelected;

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

  const selectDateAndRefresh = useCallback(
    (ymd: string) => {
      setSelectedDate(normalizeCanonicalDateKey(ymd));
      void mutate();
    },
    [mutate]
  );

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
      const ymd = tomorrowKey;
      setSelectedDate(ymd);
      void mutate();
    }
    if (pathname === "/" && searchParams.get("day") === "tomorrow") {
      router.replace("/", { scroll: false });
    }
  }, [planningQueryKey, pathname, mutate, router, setPreparingTomorrow]);

  /** Sans `mode=prep` dans l’URL, le contexte « préparation » doit être faux. */
  useEffect(() => {
    if (searchParams.get("mode") !== "prep") {
      setPreparingTomorrow(false);
    }
  }, [searchParams, setPreparingTomorrow]);

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
  };

  /** Déjà filtrées côté API par `?date=` ; garde-fou local si besoin. */
  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter(
      (r) => normalizeCanonicalDateKey(r.dateIso) === selectedKey
    );
  }, [data?.rows, selectedKey]);

  const visibleRows = useMemo(() => {
    const name = meName.trim();
    if (!meOnly || !name) return filtered;
    return filtered.filter((row) => {
      const rowKey = stableServiceRowKey(row);
      const list = normalizeAssigneeListFromStored(assignees[rowKey]);
      for (const slug of list) {
        const label = assigneeSlugToNotifyLabel(slug);
        if (label && label === name) return true;
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
    for (const row of filtered) {
      const rowKey = stableServiceRowKey(row);
      const list = normalizeAssigneeListFromStored(assignees[rowKey]);
      const serviceId = serviceReportIdFromRow(row);
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
        if (!completed && pec) anyPec = true;
        if (!completed && photo) anyPhoto = true;
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
      const optimistic = {
        ...(reportExistence ?? {
          hasReport: {},
          isPecByServiceId: {},
          isCompletedByServiceId: {},
          hasPhotoByServiceId: {},
        }),
        isPecByServiceId: {
          ...(reportExistence?.isPecByServiceId ?? {}),
          [opts.serviceId]: opts.next,
        },
      };
      void mutateReports(optimistic, { revalidate: false });

      const res = await fetch("/api/service-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet_id: spreadsheetId,
          service_id: opts.serviceId,
          service_date: opts.row.dateIso,
          service_client: opts.row.client,
          service_type: opts.row.type,
          report_kind: detectServiceReportKind(opts.row.type),
          is_pec: opts.next,
        }),
      });
      const json = (await res.json()) as { report?: unknown; error?: string };
      if (!res.ok) {
        void mutateReports();
        throw new Error(json?.error || "Sauvegarde PEC impossible.");
      }
      void mutateReports();
    },
    [mutateReports, reportExistence, spreadsheetId]
  );

  const capturePhoto = useCallback(
    async (opts: { serviceId: string; row: DailyServiceRow; file: File }) => {
      const ts = Date.now();
      const safeFileName = `photo-${ts}.png`;

      const form = new FormData();
      form.set("spreadsheetId", spreadsheetId);
      form.set("serviceId", opts.serviceId);
      form.set("fileName", safeFileName);
      form.set("file", opts.file);

      const res = await fetch("/api/service-photos/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { publicUrl?: string; error?: string };
      console.log("[photo-upload] response", json);
      if (!res.ok || !json.publicUrl) {
        throw new Error(json?.error || "Upload photo impossible.");
      }

      const optimistic = {
        ...(reportExistence ?? {
          hasReport: {},
          isPecByServiceId: {},
          isCompletedByServiceId: {},
          hasPhotoByServiceId: {},
        }),
        hasPhotoByServiceId: {
          ...(reportExistence?.hasPhotoByServiceId ?? {}),
          [opts.serviceId]: true,
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
          report_kind: detectServiceReportKind(opts.row.type),
          photo_url: json.publicUrl,
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
    (opts: { serviceId: string }) => {
      router.push(
        `/rapport/${encodeURIComponent(opts.serviceId)}?spreadsheetId=${encodeURIComponent(
          spreadsheetId
        )}&date=${encodeURIComponent(selectedKey)}`
      );
    },
    [router, spreadsheetId, selectedKey]
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
        deplanning: r.deplanning,
        pax: r.pax,
        serviceStartedAt: r.service_started_at,
        meetingTime: r.meeting_time,
        travelClass: r.travel_class,
        immigrationSpeed: r.immigration_speed,
        immigrationSecurity: r.immigration_security,
        immigrationSecuritySpeed: r.immigration_security_speed,
        checkinBags: r.checkin_bags,
        customsControl: r.customs_control,
        taxRefund: r.tax_refund,
        taxRefundSpeed: r.tax_refund_speed,
        taxRefundBy: r.tax_refund_by,
        checkin: r.checkin,
        vipLounge: r.vip_lounge,
        boardingEndOfService: r.boarding_end_of_service,
        transitBags: r.transit_bags,
        endOfService: r.end_of_service,
        placeEndOfService: r.place_end_of_service,
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

  /**
   * Conflits (rouge) : uniquement si `mode=prep` dans l’URL (isPrepMode) + demain + pas validé.
   */
  const prepModeActive = Boolean(
    isPrepMode && isTomorrowSelected && !isTomorrowPlanningFinalized
  );

  /** Barre « Planning terminé » : demain + mode préparation dans l’URL. */
  const showPrepModeBar = isTomorrowSelected && isPrepMode;

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
  }, [prepModeActive, visibleRows, assignees, assigneesBump]);

  const setAssigneesForRow = useCallback(
    (key: string, next: string[]) => {
      let safe = next
        .slice(0, MAX_PLANNING_ASSIGNEES_PER_SERVICE)
        .map((x) => normalizeAssigneeStoredValue(x));
      if (safe.length === 0) safe = [DEFAULT_PLANNING_ASSIGNEE_SLUG];
      if (typeof window === "undefined") return;
      try {
        const all = loadAssigneeStore();
        const prevRaw = all[spreadsheetId]?.[key];
        const prevArr = normalizeAssigneeListFromStored(prevRaw);
        const prevNotify = new Set(
          prevArr.filter(
            (s) =>
              s !== DEFAULT_PLANNING_ASSIGNEE_SLUG && !isUrgentAssignee(s)
          )
        );

        const cur = { ...(all[spreadsheetId] ?? {}), [key]: safe };
        all[spreadsheetId] = cur;
        window.localStorage.setItem(
          PLANNING_ASSIGNEES_STORAGE_KEY,
          JSON.stringify(all)
        );
        setAssigneesBump((b) => b + 1);

        const dateKey = normalizeCanonicalDateKey(selectedDate);
        const planningDay = planningDayBucket(
          dateKey,
          todayYmd,
          tomorrowYmd
        );
        const isPrep =
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
          void fetch("/api/push/planning-assignee-alert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spreadsheetId,
              dateKey,
              stableRowKey: key,
              assigneeName: label,
              planningDay,
            }),
          }).catch(() => {});
        }
      } catch {
        /* quota / private mode */
      }
    },
    [spreadsheetId, selectedDate, tomorrowYmd, todayYmd]
  );

  /** Détection d’urgence : nouvelles lignes du jour → 🚨 si pas encore d’assignation (y compris après refresh SWR). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rows = data?.rows;
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

    const store = loadAssigneeStore();
    const sheetAssign = { ...(store[spreadsheetId] ?? {}) };
    let changed = false;

    for (const id of newIdentities) {
      for (const stableKey of identityToStables.get(id) ?? []) {
        if (!(stableKey in sheetAssign)) {
          sheetAssign[stableKey] = [URGENT_ASSIGNEE];
          changed = true;
        }
      }
    }

    const mergedIdentities = [...new Set([...prev, ...currentIdentities])];
    snapshots[spreadsheetId] = {
      ...(snapshots[spreadsheetId] ?? {}),
      [todayKey]: mergedIdentities,
    };
    saveSnapshotStore(snapshots);

    if (changed) {
      store[spreadsheetId] = sheetAssign;
      window.localStorage.setItem(
        PLANNING_ASSIGNEES_STORAGE_KEY,
        JSON.stringify(store)
      );
      startTransition(() => setAssigneesBump((b) => b + 1));
    }
  }, [data?.rows, data?.fetchedAt, spreadsheetId, selectedDate]);

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
            onClick={() => selectDateAndRefresh(todayYmd)}
          >
            Aujourd’hui
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(dateNavButtonClass(isTomorrowSelected), "h-9")}
            onClick={() => selectDateAndRefresh(tomorrowYmd)}
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
                if (v) selectDateAndRefresh(v);
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

      {planningDataLoading && !data ? (
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
            {visibleRows.map((row, index) => {
              const rowKey = stableServiceRowKey(row);
              const assigneeList = normalizeAssigneeListFromStored(
                assignees[rowKey]
              );
              return (
                <ServiceBlock
                  key={`${rowKey}#${index}`}
                  row={row}
                  rowKey={rowKey}
                  reportServiceId={serviceReportIdFromRow(row)}
                  assignees={assigneeList}
                  onAssigneesChange={setAssigneesForRow}
                  hasTimeConflict={conflictRowKeys.has(rowKey)}
                  showConflictUi={prepModeActive}
                  isReportCompleted={Boolean(
                    isCompletedByServiceId[serviceReportIdFromRow(row)]
                  )}
                  isPec={Boolean(isPecByServiceId[serviceReportIdFromRow(row)])}
                  hasPhoto={Boolean(
                    hasPhotoByServiceId[serviceReportIdFromRow(row)]
                  )}
                  onTogglePec={async ({ serviceId, next }) =>
                    togglePec({ serviceId, next, row })
                  }
                  onCapturePhoto={async ({ serviceId, row: r, file }) =>
                    capturePhoto({ serviceId, row: r, file })
                  }
                  onOpenReportForm={openReportForm}
                  onDownloadReportPdf={async (o) => {
                    await downloadReportPdf(o);
                    void mutateReports();
                  }}
                />
              );
            })}
          </div>
          {data?.fetchedAt ? (
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
              }).format(new Date(data.fetchedAt))}
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
              onClick={handlePlanningFinished}
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
