"use client";

import { useEffect } from "react";
import useSWR from "swr";

import {
  assignableAgents,
  displayAgents,
  PLANNING_AGENT_FILTER_BAR_LABELS,
  type PlanningAgentOption,
} from "@/lib/planning/planning-team";
import type { PlanningAgentCatalogPayload } from "@/lib/planning/planning-agent-catalog";

export const MELTIN_AGENTS_CATALOG_CHANGED_EVENT =
  "meltin_agents_catalog_changed";

async function catalogFetcher(url: string): Promise<PlanningAgentCatalogPayload> {
  const res = await fetch(url);
  const json = (await res.json()) as PlanningAgentCatalogPayload & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json?.error || "Catalogue agents indisponible.");
  }
  return json;
}

export function notifyAgentsCatalogChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MELTIN_AGENTS_CATALOG_CHANGED_EVENT));
}

export function usePlanningAgentCatalog() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/planning-agents/catalog",
    catalogFetcher,
    { revalidateOnFocus: true }
  );

  useEffect(() => {
    const refresh = () => {
      void mutate();
    };
    window.addEventListener(MELTIN_AGENTS_CATALOG_CHANGED_EVENT, refresh);
    return () =>
      window.removeEventListener(MELTIN_AGENTS_CATALOG_CHANGED_EVENT, refresh);
  }, [mutate]);

  const operationalLabels = data?.operationalLabels ??
    displayAgents().map((o) => o.label);
  const filterBarLabels =
    data?.filterBarLabels ?? [...PLANNING_AGENT_FILTER_BAR_LABELS];
  const assignableOptions: PlanningAgentOption[] =
    data?.assignableOptions ?? assignableAgents();

  return {
    operationalLabels,
    filterBarLabels,
    assignableOptions,
    isLoading,
    error,
    refresh: mutate,
  };
}
