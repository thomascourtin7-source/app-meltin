"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocalSpreadsheetId } from "@/hooks/use-local-spreadsheet-id";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  generateIASchedule,
  type ShiftValue,
} from "@/lib/planning/ia/generate-ia-schedule";
import {
  clearPlanningFinalizedForServiceDate,
  getTomorrowPlanningDateKey,
} from "@/lib/planning/planning-finalized-storage";
import {
  PLANNING_ASSIGNEE_OPTIONS,
  PLANNING_URGENT_ASSIGNEE_SLUG,
} from "@/lib/planning/planning-team";
import { stableServiceRowKey } from "@/lib/planning/service-row-keys";
import { cn } from "@/lib/utils";

const SHIFT_OPTIONS: Array<{ value: ShiftValue; label: string }> = [
  { value: "morning", label: "Matin (05h-14h)" },
  { value: "evening", label: "Soir (12h-23h)" },
  { value: "full", label: "Journée complète (Matin & Soir)" },
];

const PLANNING_ASSIGNEES_STORAGE_KEY = "meltin_planning_assignees_v3";

type AssigneeStore = Record<string, Record<string, string[]>>;

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

async function fetchPlanningRows(opts: {
  spreadsheetId: string;
  dateIso: string;
}): Promise<DailyServiceRow[]> {
  const res = await fetch(
    `/api/planning-services?spreadsheetId=${encodeURIComponent(
      opts.spreadsheetId
    )}&date=${encodeURIComponent(opts.dateIso)}`
  );
  const json = (await res.json()) as { rows?: DailyServiceRow[]; error?: string };
  if (!res.ok) {
    throw new Error(json?.error || "Impossible de charger le planning.");
  }
  return json.rows ?? [];
}

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

function saveAssigneeStore(store: AssigneeStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PLANNING_ASSIGNEES_STORAGE_KEY,
    JSON.stringify(store)
  );
}

export function PlanningIaClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configuredId = useLocalSpreadsheetId();

  const spreadsheetIdFromUrl = (searchParams.get("spreadsheetId") || "").trim();
  const spreadsheetId =
    spreadsheetIdFromUrl ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    configuredId ||
    DEFAULT_PLANNING_SPREADSHEET_ID;

  const agentLabels = useMemo(() => {
    return PLANNING_ASSIGNEE_OPTIONS.filter(
      (o) =>
        o.value !== "__none__" &&
        o.value !== PLANNING_URGENT_ASSIGNEE_SLUG &&
        o.value !== "subcontracted"
    ).map((o) => o.label);
  }, []);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [shifts, setShifts] = useState<Record<string, ShiftValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgents = useMemo(() => {
    return agentLabels.filter((label) => Boolean(selected[label]));
  }, [agentLabels, selected]);

  function toggleAgent(label: string, next: boolean) {
    setSelected((prev) => ({ ...prev, [label]: next }));
    if (next) {
      setShifts((prev) => ({ ...prev, [label]: prev[label] ?? "full" }));
    }
  }

  async function onGenerate(): Promise<void> {
    setError(null);
    if (!spreadsheetId) {
      setError("SpreadsheetId manquant (Configuration).");
      return;
    }
    if (selectedAgents.length === 0) return;

    setBusy(true);
    try {
      const tomorrowIso = normalizeCanonicalDateKey(
        formatLocalYmd(addDaysLocal(new Date(), 1))
      );

      const rows = await fetchPlanningRows({
        spreadsheetId,
        dateIso: tomorrowIso,
      });

      const agents = selectedAgents
        .map((label) => {
          const opt = PLANNING_ASSIGNEE_OPTIONS.find((o) => o.label === label);
          if (!opt) return null;
          return {
            label,
            slug: opt.value,
            shift: shifts[label] ?? "full",
          };
        })
        .filter(Boolean) as Array<{ label: string; slug: string; shift: ShiftValue }>;

      const schedule = generateIASchedule({
        rows,
        rowKeyForRow: stableServiceRowKey,
        agents,
      });

      const store = loadAssigneeStore();
      const sheetMap = { ...(store[spreadsheetId] ?? {}) };

      for (const row of rows) {
        const rk = stableServiceRowKey(row);
        const slug = schedule.assignmentsByRowKey[rk];
        if (typeof slug === "string" && slug.trim()) {
          sheetMap[rk] = [slug];
        }
      }

      store[spreadsheetId] = sheetMap;
      saveAssigneeStore(store);

      clearPlanningFinalizedForServiceDate(getTomorrowPlanningDateKey());
      router.push("/planning?mode=prep&date=tomorrow");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 pb-16">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Planning de demain (IA)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionnez les agents et leurs shifts, puis générez une proposition
            de planning.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/configuration")}
        >
          Retour
        </Button>
      </div>

      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle>Sélection des agents</CardTitle>
          <CardDescription>
            Cochez les agents à inclure dans la génération.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {agentLabels.map((label) => {
              const checked = Boolean(selected[label]);
              return (
                <label
                  key={label}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background"
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    onChange={(e) => toggleAgent(label, e.target.checked)}
                  />
                  <span className="truncate font-medium">{label}</span>
                </label>
              );
            })}
          </div>

          {selectedAgents.length > 0 ? (
            <div className="space-y-3">
              <Label>Shift de travail</Label>
              <div className="space-y-2">
                {selectedAgents.map((label) => (
                  <div
                    key={label}
                    className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm font-medium">{label}</div>
                    <Select
                      value={shifts[label] ?? "full"}
                      onValueChange={(v) =>
                        setShifts((prev) => ({
                          ...prev,
                          [label]: (v as ShiftValue) ?? "full",
                        }))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[320px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sélectionnez au moins un agent pour choisir les shifts.
            </p>
          )}

          <Button
            type="button"
            size="lg"
            className="h-auto w-full rounded-xl border shadow-sm px-6 py-5 text-base font-semibold"
            disabled={selectedAgents.length === 0 || busy}
            onClick={() => void onGenerate()}
          >
            {busy ? "Génération…" : "Générer le planning avec l'IA"}
          </Button>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

