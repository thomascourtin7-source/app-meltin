"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import {
  Calendar,
  Loader2,
  Plus,
  RefreshCw,
  UserCircle,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  MAX_PLANNING_ASSIGNEES_PER_SERVICE,
  PLANNING_ASSIGNEE_OPTIONS,
  PLANNING_URGENT_ASSIGNEE_DISPLAY,
  PLANNING_URGENT_ASSIGNEE_SLUG,
  isUrgentAssignee,
  matchSheetAssigneeToTeamLabel,
  normalizeAssigneeListFromStored,
  normalizeAssigneeStoredValue,
} from "@/lib/planning/planning-team";
import {
  serviceUrgencyIdentityKey,
  stableServiceRowKey,
} from "@/lib/planning/service-row-keys";
import { cn } from "@/lib/utils";
import { PlanningPhoneRichText } from "@/components/planning/planning-phone-rich-text";

const POLL_MS = 5 * 60 * 1000;

const DEFAULT_ASSIGNEE = DEFAULT_PLANNING_ASSIGNEE_SLUG;

const PLANNING_ASSIGNEES_STORAGE_KEY = "meltin_planning_assignees_v3";

/** Ancienne clé (chaîne unique par ligne) → migrée une fois vers v3. */
const PLANNING_ASSIGNEES_STORAGE_KEY_LEGACY_V2 = "meltin_planning_assignees_v2";

/** Snapshots des identités « vues » par jour (détection des nouvelles lignes). */
const PLANNING_ROW_SNAPSHOT_KEY = "meltin_planning_row_snapshot_v1";

/** Dernière valeur colonne « assigné » du Sheet par ligne (push ciblé). */
const PLANNING_SHEET_ASSIGNEE_SNAPSHOT_KEY =
  "meltin_planning_sheet_assignee_snapshot_v1";

/** Par feuille : par clé de ligne stable, tableau de slugs (1 à 4). */
type AssigneeStore = Record<string, Record<string, string[]>>;

type SnapshotStore = Record<string, Record<string, string[]>>;

type SheetAssigneeSnapshotStore = Record<
  string,
  Record<string, Record<string, string>>
>;

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

function loadSheetAssigneeSnapshot(): SheetAssigneeSnapshotStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLANNING_SHEET_ASSIGNEE_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SheetAssigneeSnapshotStore;
  } catch {
    return {};
  }
}

function saveSheetAssigneeSnapshot(store: SheetAssigneeSnapshotStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PLANNING_SHEET_ASSIGNEE_SNAPSHOT_KEY,
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
  assignees: string[];
  onAssigneesChange: (key: string, next: string[]) => void;
};

/** Police : meilleur rendu des emojis sur iOS / Android. */
const ASSIGNEE_SELECT_EMOJI_FONT =
  "[font-family:system-ui,-apple-system,'Segoe_UI_Emoji','Apple_Color_Emoji',sans-serif]";

const URGENT_ASSIGNEE = PLANNING_URGENT_ASSIGNEE_SLUG;

function ServiceBlock({
  row,
  rowKey,
  assignees,
  onAssigneesChange,
}: ServiceBlockProps) {
  const isUrgent = assignees.some((a) => isUrgentAssignee(a));

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
          : "border-border/50"
      )}
    >
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
                        "z-[9999] max-h-72",
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
        </h2>
        <p className="mb-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            Type :{" "}
          </span>
          <PlanningPhoneRichText text={typeLine || "—"} />
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
    </div>
  );
}

export function DailyServicesView() {
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

  const [assigneesBump, setAssigneesBump] = useState(0);

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

  const swrKey = `/api/planning-services?spreadsheetId=${encodeURIComponent(
    spreadsheetId
  )}&date=${encodeURIComponent(normalizeCanonicalDateKey(selectedDate))}`;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
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

  const selectDateAndRefresh = useCallback(
    (ymd: string) => {
      setSelectedDate(normalizeCanonicalDateKey(ymd));
      void mutate();
    },
    [mutate]
  );

  /** Déjà filtrées côté API par `?date=` ; garde-fou local si besoin. */
  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter(
      (r) => normalizeCanonicalDateKey(r.dateIso) === selectedKey
    );
  }, [data?.rows, selectedKey]);

  const setAssigneesForRow = useCallback(
    (key: string, next: string[]) => {
      let safe = next
        .slice(0, MAX_PLANNING_ASSIGNEES_PER_SERVICE)
        .map((x) => normalizeAssigneeStoredValue(x));
      if (safe.length === 0) safe = [DEFAULT_PLANNING_ASSIGNEE_SLUG];
      if (typeof window === "undefined") return;
      try {
        const all = loadAssigneeStore();
        const cur = { ...(all[spreadsheetId] ?? {}), [key]: safe };
        all[spreadsheetId] = cur;
        window.localStorage.setItem(
          PLANNING_ASSIGNEES_STORAGE_KEY,
          JSON.stringify(all)
        );
        setAssigneesBump((b) => b + 1);
      } catch {
        /* quota / private mode */
      }
    },
    [spreadsheetId]
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
    const identitiesMarkedUrgent: string[] = [];

    for (const id of newIdentities) {
      for (const stableKey of identityToStables.get(id) ?? []) {
        if (!(stableKey in sheetAssign)) {
          sheetAssign[stableKey] = [URGENT_ASSIGNEE];
          changed = true;
          if (!identitiesMarkedUrgent.includes(id)) identitiesMarkedUrgent.push(id);
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

      if (identitiesMarkedUrgent.length > 0) {
        void fetch("/api/push/planning-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheetId,
            dateKey: todayKey,
            newIdentityKeys: identitiesMarkedUrgent,
          }),
        }).catch(() => {});
      }
    }
  }, [data?.rows, data?.fetchedAt, spreadsheetId, selectedDate]);

  /** Colonne « assigné » du Sheet : changement → push uniquement vers le membre ciblé. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rows = data?.rows;
    if (!rows?.length) return;

    const dateKey = normalizeCanonicalDateKey(selectedDate);
    const rowsForDay = rows.filter(
      (r) => normalizeCanonicalDateKey(r.dateIso) === dateKey
    );
    if (!rowsForDay.length) return;

    const snapshots = loadSheetAssigneeSnapshot();
    const prevMap = snapshots[spreadsheetId]?.[dateKey];

    const nextMap: Record<string, string> = {};
    for (const row of rowsForDay) {
      nextMap[stableServiceRowKey(row)] = row.sheetAssignee.trim();
    }

    if (prevMap === undefined) {
      snapshots[spreadsheetId] = {
        ...(snapshots[spreadsheetId] ?? {}),
        [dateKey]: nextMap,
      };
      saveSheetAssigneeSnapshot(snapshots);
      return;
    }

    for (const row of rowsForDay) {
      const stableKey = stableServiceRowKey(row);
      const prevRaw = (prevMap[stableKey] ?? "").trim();
      const nextRaw = row.sheetAssignee.trim();
      if (prevRaw === nextRaw) continue;

      const target = matchSheetAssigneeToTeamLabel(nextRaw);
      if (!target) continue;

      const prevTarget = matchSheetAssigneeToTeamLabel(prevRaw);
      if (prevTarget === target) continue;

      void fetch("/api/push/planning-assignee-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId,
          dateKey,
          stableRowKey: stableKey,
          assigneeName: target,
        }),
      }).catch(() => {});
    }

    snapshots[spreadsheetId] = {
      ...(snapshots[spreadsheetId] ?? {}),
      [dateKey]: nextMap,
    };
    saveSheetAssigneeSnapshot(snapshots);
  }, [data?.rows, data?.fetchedAt, spreadsheetId, selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = data as PlanningServicesPayload | undefined;
    console.log("[Planning] date sélectionnée (sélecteur, YYYY-MM-DD) :", selectedDate);
    console.log("[Planning] clé normalisée pour filtre :", selectedKey);
    console.log(
      "[Planning] premières lignes brutes du Sheet (max 20) :",
      payload?.debug?.rawFirstRows
    );
    console.log(
      "[Planning] plage API / ligne d’en-tête / colonne DATE :",
      payload?.debug?.range,
      "headerRowIndex =",
      payload?.debug?.headerRowIndex,
      "dateColumnIndex =",
      payload?.debug?.dateColumnIndex
    );
    console.log(
      "[Planning] échantillon cellules DATE brutes (après en-tête) :",
      payload?.debug?.rawDateCellSamples
    );
    console.log(
      "[Planning] dates distinctes parsées (échantillon) :",
      payload?.debug?.uniqueParsedDates
    );
    console.log(
      "[Planning] lignes parsées (max 8) :",
      (payload?.rows ?? []).slice(0, 8)
    );
  }, [data, selectedDate, selectedKey]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Planning du jour
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Données Google Sheets · actualisation automatique toutes les{" "}
            {POLL_MS / 60_000} minutes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutate()}
          disabled={isLoading || isValidating}
          className="gap-1.5 self-start sm:self-auto"
        >
          {isValidating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Actualiser
        </Button>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <Label id="planning-day-label">Jour affiché</Label>
        <div className="flex flex-row flex-wrap items-stretch gap-2">
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
          <div className="relative isolate z-[9999] flex h-11 w-11 shrink-0 items-center justify-center sm:h-9 sm:w-9">
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
                "absolute inset-0 z-[9999] box-border h-full w-full max-w-none cursor-pointer opacity-0",
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
        </div>
      </div>

      {isLoading && !data ? (
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
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-12 text-center text-muted-foreground">
          Aucun planning pour cette journée
        </p>
      ) : (
        <>
          <div className="w-full">
            {filtered.map((row, index) => {
              const rowKey = stableServiceRowKey(row);
              const assigneeList = normalizeAssigneeListFromStored(
                assignees[rowKey]
              );
              return (
                <ServiceBlock
                  key={`${rowKey}#${index}`}
                  row={row}
                  rowKey={rowKey}
                  assignees={assigneeList}
                  onAssigneesChange={setAssigneesForRow}
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
    </div>
  );
}
