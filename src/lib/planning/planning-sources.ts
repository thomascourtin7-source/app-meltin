import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { DEFAULT_PLANNING_SPREADSHEET_ID } from "@/lib/planning/daily-services-constants";

export const PLANNING_SOURCE_MISSING_ERROR =
  "Aucun Google Sheet configuré pour ce mois";

export type PlanningSourceRow = {
  id: string;
  month_name: string;
  month_index: number;
  year: number;
  spreadsheet_id: string;
  is_active: boolean;
};

export type PlanningMonthRef = {
  monthIndex: number;
  year: number;
};

type PlanningSourceSeed = {
  month_name: string;
  month_index: number;
  year: number;
  spreadsheet_id: string;
};

const DEFAULT_PLANNING_SOURCE_SEEDS: PlanningSourceSeed[] = [
  {
    month_name: "Juin 2026",
    month_index: 6,
    year: 2026,
    spreadsheet_id: "1Fc0Axtjh1zAMZsPS4QNOLQAzj2a43278XzT-NPYixH8",
  },
  {
    month_name: "Juillet 2026",
    month_index: 7,
    year: 2026,
    spreadsheet_id: "1gK1OoFP0qaBLtwgHIqkc4R5Wyp5NqJ454Y9BuYZ2EKU",
  },
  {
    month_name: "Août 2026",
    month_index: 8,
    year: 2026,
    spreadsheet_id: "1k4C-HKS4UpB1Nloax2RGUQ2wzMAAcuGyui00fKiJxYQ",
  },
  {
    month_name: "Septembre 2026",
    month_index: 9,
    year: 2026,
    spreadsheet_id: "11N6cT7hmCdMXSMVOA1GR28KP2MLoQBghCmG7R3-0OkU",
  },
  {
    month_name: "Octobre 2026",
    month_index: 10,
    year: 2026,
    spreadsheet_id: "1CcoqPAX6-6ojzyt_B-yG7lUt84bIHTPHaiZ8xeuYqDs",
  },
  {
    month_name: "Novembre 2026",
    month_index: 11,
    year: 2026,
    spreadsheet_id: "1AwygSI8FMPupCClBP70JG99EJxIkFlmzpxjLM3fnwUY",
  },
  {
    month_name: "Décembre 2026",
    month_index: 12,
    year: 2026,
    spreadsheet_id: "1ZVpYJ4miCRUPL8VPeWeU274Kwp8cpmKWALvYSBP5IZ8",
  },
];

let initPlanningSourcesPromise: Promise<void> | null = null;

/** Date du jour (YYYY-MM-DD) en Europe/Paris. */
export function todayIsoParis(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ID Google Sheet issu des variables d’environnement (logique historique). */
export function readEnvPlanningSpreadsheetId(): string | null {
  const id =
    process.env.PLANNING_SPREADSHEET_ID?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_SPREADSHEET_ID?.trim() ||
    DEFAULT_PLANNING_SPREADSHEET_ID.trim();
  return id || null;
}

export function isSamePlanningMonth(
  a: PlanningMonthRef,
  b: PlanningMonthRef
): boolean {
  return a.monthIndex === b.monthIndex && a.year === b.year;
}

export function monthYearFromDateIso(dateIso: string): PlanningMonthRef {
  const key = normalizeCanonicalDateKey(dateIso).slice(0, 10);
  const [yearRaw, monthRaw] = key.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    throw new Error("Date de planning invalide.");
  }
  return { monthIndex, year };
}

export function nextPlanningMonth(ref: PlanningMonthRef): PlanningMonthRef {
  if (ref.monthIndex >= 12) {
    return { monthIndex: 1, year: ref.year + 1 };
  }
  return { monthIndex: ref.monthIndex + 1, year: ref.year };
}

/** Mois courant + mois suivant (ancre = date sélectionnée ou aujourd’hui). */
export function globalImportMonths(anchorDateIso: string): PlanningMonthRef[] {
  const current = monthYearFromDateIso(anchorDateIso);
  const next = nextPlanningMonth(current);
  return [current, next];
}

/** Réinitialise `planning_sources` (juin–décembre 2026) par delete puis insert. */
export async function initPlanningSources(
  supabase: SupabaseClient
): Promise<void> {
  const rows = DEFAULT_PLANNING_SOURCE_SEEDS.map((row) => ({
    month_name: String(row.month_name),
    month_index: row.month_index,
    year: row.year,
    spreadsheet_id: String(row.spreadsheet_id),
    is_active: true,
  }));

  const { error: deleteError } = await supabase
    .from("planning_sources")
    .delete()
    .not("id", "is", null);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await supabase
    .from("planning_sources")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }

  console.log("Données insérées avec succès");
}

async function ensurePlanningSourcesInitialized(
  supabase: SupabaseClient
): Promise<void> {
  if (!initPlanningSourcesPromise) {
    initPlanningSourcesPromise = (async () => {
      try {
        await initPlanningSources(supabase);
      } catch (error) {
        console.error(
          "[planning_sources] Initialisation ignorée (planning inchangé) :",
          error
        );
      }
    })();
  }

  await initPlanningSourcesPromise;
}

export async function fetchPlanningSourceForMonth(
  supabase: SupabaseClient,
  month: PlanningMonthRef
): Promise<PlanningSourceRow | null> {
  const { data, error } = await supabase
    .from("planning_sources")
    .select("id,month_name,month_index,year,spreadsheet_id,is_active")
    .eq("year", month.year)
    .eq("month_index", month.monthIndex)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const row = data as PlanningSourceRow;
  const spreadsheetId = row.spreadsheet_id?.trim();
  if (!spreadsheetId) return null;
  return { ...row, spreadsheet_id: spreadsheetId };
}

/**
 * Mois calendaire courant (Paris) : priorité `.env`, puis `planning_sources`.
 * Autres mois : `planning_sources` uniquement.
 */
export async function resolveSpreadsheetIdForPlanningMonth(
  supabase: SupabaseClient,
  month: PlanningMonthRef
): Promise<string | null> {
  await ensurePlanningSourcesInitialized(supabase);

  const currentMonth = monthYearFromDateIso(todayIsoParis());
  const isCurrentMonth = isSamePlanningMonth(month, currentMonth);

  if (isCurrentMonth) {
    const envId = readEnvPlanningSpreadsheetId();
    if (envId) return envId;
  }

  let source: PlanningSourceRow | null = null;
  try {
    source = await fetchPlanningSourceForMonth(supabase, month);
  } catch {
    source = null;
  }
  if (source) return source.spreadsheet_id;

  return readEnvPlanningSpreadsheetId();
}

export async function resolveSpreadsheetIdForDate(
  supabase: SupabaseClient,
  dateIso: string
): Promise<string> {
  const month = monthYearFromDateIso(dateIso);
  const spreadsheetId = await resolveSpreadsheetIdForPlanningMonth(
    supabase,
    month
  );
  if (!spreadsheetId) {
    throw new Error(PLANNING_SOURCE_MISSING_ERROR);
  }
  return spreadsheetId;
}

export async function resolveSpreadsheetIdsForGlobalImport(
  supabase: SupabaseClient,
  anchorDateIso: string
): Promise<{
  spreadsheetIds: string[];
  missingMonths: PlanningMonthRef[];
}> {
  const spreadsheetIds: string[] = [];
  const missingMonths: PlanningMonthRef[] = [];

  for (const month of globalImportMonths(anchorDateIso)) {
    const spreadsheetId = await resolveSpreadsheetIdForPlanningMonth(
      supabase,
      month
    );
    if (!spreadsheetId) {
      missingMonths.push(month);
      continue;
    }
    if (!spreadsheetIds.includes(spreadsheetId)) {
      spreadsheetIds.push(spreadsheetId);
    }
  }

  return { spreadsheetIds, missingMonths };
}
