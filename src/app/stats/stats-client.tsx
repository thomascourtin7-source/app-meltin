"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Loader2, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import { useLocalSpreadsheetId } from "@/hooks/use-local-spreadsheet-id";
import { usePlanningAdminClient } from "@/hooks/use-planning-admin-client";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";
import type {
  PlanningScoreRow,
  PlanningStatsPeriod,
  PlanningStatsPeriodMeta,
} from "@/lib/planning/planning-stats";
import { cn } from "@/lib/utils";

type StatsPayload = {
  period: PlanningStatsPeriodMeta;
  spreadsheetId: string;
  rows: PlanningScoreRow[];
};

async function fetchStats(url: string, token: string): Promise<StatsPayload> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Impossible de charger les statistiques.";
    throw new Error(msg);
  }
  return data as StatsPayload;
}

export function StatsClient() {
  const router = useRouter();
  const isPlanningAdmin = usePlanningAdminClient();
  const configuredId = useLocalSpreadsheetId();
  const spreadsheetId =
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    configuredId ||
    DEFAULT_PLANNING_SPREADSHEET_ID;

  const [period, setPeriod] = useState<PlanningStatsPeriod>("current_month");

  const swrKey = useMemo(() => {
    if (!isPlanningAdmin) return null;
    const token = readPlanningAuthSession()?.token;
    if (!token) return null;
    const q = new URLSearchParams({
      period,
      spreadsheetId,
    });
    return [`/api/planning-stats?${q.toString()}`, token] as const;
  }, [isPlanningAdmin, period, spreadsheetId]);

  const { data, error, isLoading, isValidating } = useSWR(
    swrKey,
    ([url, token]) => fetchStats(url, token),
    { revalidateOnFocus: true }
  );

  if (!isPlanningAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <p className="text-sm text-muted-foreground">
          Le tableau des scores est réservé aux administrateurs.
        </p>
        <Button type="button" variant="outline" onClick={() => router.push("/configuration")}>
          Retour à la configuration
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Trophy className="size-7 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">
              Tableau des scores
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Rapports complétés par agent, répartition matin / après-midi / journée
            entière, et jours sans service sur la période.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="inline-flex shrink-0 self-start items-center gap-2"
          onClick={() => router.push("/configuration")}
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          Configuration
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Période
          </p>
          <Select
            value={period}
            onValueChange={(v) =>
              setPeriod((v as PlanningStatsPeriod) ?? "current_month")
            }
          >
            <SelectTrigger className="w-full min-w-[12rem] sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Ce mois-ci</SelectItem>
              <SelectItem value="last_month">Mois dernier</SelectItem>
              <SelectItem value="total">Total</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {data?.period ? (
          <p className="text-xs text-muted-foreground sm:text-right">
            Du{" "}
            <span className="font-medium text-foreground">
              {formatFrDate(data.period.start)}
            </span>{" "}
            au{" "}
            <span className="font-medium text-foreground">
              {formatFrDate(data.period.end)}
            </span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{data.period.labelFr}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error instanceof Error ? error.message : "Erreur inconnue."}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border/60 shadow-sm">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left">
              <th className="sticky left-0 z-10 whitespace-nowrap bg-muted/40 px-3 py-3 font-semibold backdrop-blur-sm sm:px-4">
                Agent
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-4">
                Accueils
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-4">
                Matins
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-4">
                Après-midi
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-4">
                Journées entières
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-4">
                Jours OFF
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 size-6 animate-spin" aria-hidden />
                  Chargement…
                </td>
              </tr>
            ) : data?.rows?.length ? (
              data.rows.map((row, i) => (
                <tr
                  key={row.agent}
                  className={cn(
                    "border-b border-border/40 last:border-0",
                    i % 2 === 1 && "bg-muted/15"
                  )}
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border/30 bg-card px-3 py-2.5 font-medium backdrop-blur-sm sm:px-4">
                    {row.agent}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {row.accueils}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {row.matins}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {row.apresMidi}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {row.journeesEntieres}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:px-4">
                    {row.joursOff}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Aucune donnée pour cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isValidating && data ? (
        <p className="text-center text-xs text-muted-foreground">Mise à jour…</p>
      ) : null}
    </div>
  );
}

function formatFrDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso + "T12:00:00"));
  } catch {
    return iso;
  }
}
