import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import {
  assigneeSlugFromNotifyLabel,
  parseAssigneeNameToSlugs,
} from "@/lib/planning/planning-team";
import { serviceLookupIdsFromRow } from "@/lib/reports/service-report-id";
import type { getSupabaseAdmin } from "@/lib/supabase/admin";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export function storedAssigneeIncludesAgent(
  agentName: string | null | undefined,
  agentLabelOrSlug: string
): boolean {
  const target =
    assigneeSlugFromNotifyLabel(agentLabelOrSlug)?.trim().toLowerCase() ?? "";
  if (!target) return false;
  return parseAssigneeNameToSlugs(agentName).some(
    (slug) => slug.trim().toLowerCase() === target
  );
}

export function rowIsAssignedToAgent(
  row: DailyServiceRow,
  assignmentNameByServiceId: Map<string, string>,
  agentLabelOrSlug: string
): boolean {
  for (const id of serviceLookupIdsFromRow(row)) {
    const name = assignmentNameByServiceId.get(id);
    if (storedAssigneeIncludesAgent(name, agentLabelOrSlug)) return true;
  }
  return false;
}

export async function loadAssignmentNameByServiceId(
  supabase: SupabaseAdmin,
  opts: { serviceDate?: string; serviceIds?: string[] }
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const serviceDate = opts.serviceDate?.trim().slice(0, 10) ?? "";
  const serviceIds = [...new Set((opts.serviceIds ?? []).map((id) => id.trim()).filter(Boolean))];

  if (serviceDate) {
    const { data } = await supabase
      .from("planning_assignments")
      .select("service_id,agent_name")
      .eq("service_date", serviceDate);
    mergeAssignmentRows(map, data);
  }

  const PAGE = 200;
  for (let i = 0; i < serviceIds.length; i += PAGE) {
    const chunk = serviceIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from("planning_assignments")
      .select("service_id,agent_name")
      .in("service_id", chunk);
    mergeAssignmentRows(map, data);
  }

  return map;
}

function mergeAssignmentRows(
  map: Map<string, string>,
  data: unknown[] | null | undefined
): void {
  for (const row of data ?? []) {
    const o = row as { service_id?: unknown; agent_name?: unknown };
    const id = typeof o.service_id === "string" ? o.service_id.trim() : "";
    const name = typeof o.agent_name === "string" ? o.agent_name.trim() : "";
    if (!id || !name) continue;
    map.set(id, name);
  }
}

export async function filterPlanningRowsForAgent(
  supabase: SupabaseAdmin,
  rows: DailyServiceRow[],
  agentName: string,
  serviceDate?: string
): Promise<DailyServiceRow[]> {
  const serviceIds = rows.flatMap((row) => serviceLookupIdsFromRow(row));
  const assignmentNameByServiceId = await loadAssignmentNameByServiceId(
    supabase,
    { serviceDate, serviceIds }
  );
  return rows.filter((row) =>
    rowIsAssignedToAgent(row, assignmentNameByServiceId, agentName)
  );
}
