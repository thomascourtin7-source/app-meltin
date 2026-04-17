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
import { Calendar, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocalSpreadsheetId } from "@/hooks/use-local-spreadsheet-id";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  DEFAULT_PLANNING_ASSIGNEE_SLUG,
  KNOWN_PLANNING_ASSIGNEE_SLUGS,
  PLANNING_ASSIGNEE_OPTIONS,
  matchSheetAssigneeToTeamLabel,
} from "@/lib/planning/planning-team";
import {
  serviceUrgencyIdentityKey,
  stableServiceRowKey,
} from "@/lib/planning/service-row-keys";
import { cn } from "@/lib/utils";

const POLL_MS = 5 * 60 * 1000;

const DEFAULT_ASSIGNEE = DEFAULT_PLANNING_ASSIGNEE_SLUG;

const KNOWN_ASSIGNEE_VALUES: string[] = KNOWN_PLANNING_ASSIGNEE_SLUGS;

const PLANNING_ASSIGNEES_STORAGE_KEY = "meltin_planning_assignees_v2";

/** Snapshots des identités « vues » par jour (détection des nouvelles lignes). */
const PLANNING_ROW_SNAPSHOT_KEY = "meltin_planning_row_snapshot_v1";

/** Dernière valeur colonne « assigné » du Sheet par ligne (push ciblé). */
const PLANNING_SHEET_ASSIGNEE_SNAPSHOT_KEY =
  "meltin_planning_sheet_assignee_snapshot_v1";

type AssigneeStore = Record<string, Record<string, string>>;

type SnapshotStore = Record<string, Record<string, string[]>>;

type SheetAssigneeSnapshotStore = Record<
  string,
  Record<string, Record<string, string>>
>;

function loadAssigneeStore(): AssigneeStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLANNING_ASSIGNEES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as AssigneeStore;
  } catch {
    return {};
  }
}

function normalizeStoredValue(value: string | undefined): string {
  if (value && KNOWN_ASSIGNEE_VALUES.includes(value)) return value;
  return DEFAULT_ASSIGNEE;
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

function openNativeDatePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  if (typeof input.showPicker === "function") {
    try {
      input.showPicker();
      return;
    } catch {
      /* certains navigateurs lancent si non gesture */
    }
  }
  input.click();
}

function formatTelDriverLine(row: DailyServiceRow): string {
  const t = row.tel.trim();
  const d = row.driverInfo.trim();
  if (!t && !d) return "";
  if (!d) return t;
  if (!t) return d;
  return `${t} / ${d}`;
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
  assignee: string;
  onAssigneeChange: (key: string, value: string) => void;
};

const URGENT_ASSIGNEE = "emoji_alert";

function ServiceBlock({
  row,
  rowKey,
  assignee,
  onAssigneeChange,
}: ServiceBlockProps) {
  const telDriver = formatTelDriverLine(row);
  const isUrgent = assignee === URGENT_ASSIGNEE;

  return (
    <div
      className={cn(
        "mb-8 w-full max-w-4xl last:mb-0 md:mx-auto rounded-lg px-2 py-2 -mx-2",
        isUrgent && "bg-red-50 dark:bg-red-950/30"
      )}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 text-xs text-muted-foreground">
          Assigné à :
        </span>
        <Select
          value={assignee}
          onValueChange={(v) =>
            onAssigneeChange(rowKey, v ?? DEFAULT_ASSIGNEE)
          }
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-full border border-border/50 bg-muted/40 text-sm shadow-none sm:max-w-[280px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {PLANNING_ASSIGNEE_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                className={
                  opt.value === "emoji_alert"
                    ? "py-2.5 text-base leading-none focus:bg-muted focus-visible:bg-muted"
                    : undefined
                }
              >
                <span
                  className={
                    opt.value === "emoji_alert"
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

      <div className="space-y-0 text-sm leading-relaxed text-foreground">
        <p className="font-medium">
          {row.type} - {row.client}
        </p>
        <p className={cn(!telDriver && "text-muted-foreground")}>
          {telDriver || "—"}
        </p>
        <div className="h-3 min-h-3" aria-hidden />
        <p>
          {row.vol} - {row.destProv}
        </p>
        <p>
          {row.rdv1} - {row.rdv2}
        </p>
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

  const [assigneesBump, setAssigneesBump] = useState(0);

  const assignees = useMemo(() => {
    void assigneesBump;
    if (typeof window === "undefined") return {};
    const sheetMap = loadAssigneeStore()[spreadsheetId];
    if (!sheetMap) return {};
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(sheetMap)) {
      next[k] = normalizeStoredValue(v);
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

  const setAssignee = useCallback(
    (key: string, value: string) => {
      const safe = normalizeStoredValue(value);
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
          sheetAssign[stableKey] = URGENT_ASSIGNEE;
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
          <Button
            type="button"
            variant="ghost"
            aria-label="Choisir une date dans le calendrier"
            className={cn(
              "size-9 shrink-0 rounded-lg shadow-none",
              isCustomDateSelected
                ? "bg-neutral-950 text-white hover:bg-neutral-900 hover:text-white dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200 dark:hover:text-neutral-950"
                : "bg-muted text-foreground hover:bg-muted/80"
            )}
            onClick={() => openNativeDatePicker(datePickerRef.current)}
          >
            <Calendar className="size-4" aria-hidden />
          </Button>
          <input
            ref={datePickerRef}
            type="date"
            className="sr-only"
            tabIndex={-1}
            value={selectedDate}
            onChange={(e) => {
              const v = e.target.value;
              if (v) selectDateAndRefresh(v);
            }}
            aria-labelledby="planning-day-label"
          />
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
              const assignee = normalizeStoredValue(assignees[rowKey]);
              return (
                <ServiceBlock
                  key={`${rowKey}#${index}`}
                  row={row}
                  rowKey={rowKey}
                  assignee={assignee}
                  onAssigneeChange={setAssignee}
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
