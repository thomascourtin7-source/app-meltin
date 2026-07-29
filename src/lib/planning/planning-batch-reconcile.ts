import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { parseTime } from "@/lib/planning/time-conflicts";
import { serviceReportIdFromRow } from "@/lib/reports/service-report-id";
import {
  buildMissionLooseCoreCounts,
  type MissionReportMetadata,
  resolveStoredServiceIdForRow,
  storedServiceIdMatchesRow,
} from "@/lib/planning/mission-identity-match";

type AssignmentRow = {
  service_id: string;
  agent_name?: string | null;
  eta_time?: string | null;
  updated_at?: string | null;
};

type ReportRow = MissionReportMetadata & {
  service_id: string;
};

function buildReportMap(
  reports: ReportRow[]
): Map<string, MissionReportMetadata> {
  return new Map(reports.map((r) => [r.service_id.trim(), r] as const));
}

function rowSortMinutes(row: DailyServiceRow): number {
  const times = parseTime(`${row.rdv1 ?? ""} ${row.rdv2 ?? ""}`);
  return times[0] ?? 24 * 60 + 1;
}

/**
 * Repli ultime quand les Ids Sheet ont changé après la préparation :
 * même nombre de lignes / assignations orphelines → appariement par ordre
 * chronologique (RDV croissant ↔ `updated_at` croissant).
 */
function reconcileOrphanAssignmentsByPrepOrder(
  rows: DailyServiceRow[],
  assignments: AssignmentRow[],
  mappedCanonicalIds: Set<string>,
  mappedAssignmentIds: Set<string>
): Record<string, string> {
  const unmappedRows = rows.filter((row) => {
    const canonical = serviceReportIdFromRow(row);
    return canonical && !mappedCanonicalIds.has(canonical);
  });
  const orphanAssignments = assignments.filter((a) => {
    const id = a.service_id.trim();
    const name = String(a.agent_name ?? "").trim();
    return id && name && !mappedAssignmentIds.has(id);
  });

  if (unmappedRows.length === 0 || orphanAssignments.length === 0) return {};
  if (unmappedRows.length !== orphanAssignments.length) return {};

  const sortedRows = [...unmappedRows].sort(
    (a, b) => rowSortMinutes(a) - rowSortMinutes(b)
  );
  const sortedAssignments = [...orphanAssignments].sort((a, b) =>
    String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? ""))
  );

  const out: Record<string, string> = {};
  for (let i = 0; i < sortedRows.length; i++) {
    const canonical = serviceReportIdFromRow(sortedRows[i]!);
    const name = String(sortedAssignments[i]?.agent_name ?? "").trim();
    if (canonical && name) out[canonical] = name;
  }
  return out;
}

/** Assignations / ETA indexées par `service_id` canonique (Id Sheet actuel). */
export function reconcileAssignmentsByCanonicalId(
  rows: DailyServiceRow[],
  assignments: AssignmentRow[],
  reports: ReportRow[] = []
): {
  assigneesByServiceId: Record<string, string>;
  etaTimeByServiceId: Record<string, string | null>;
} {
  const storedIds = new Set(
    [
      ...assignments.map((a) => a.service_id.trim()),
      ...reports.map((r) => r.service_id.trim()),
    ].filter(Boolean)
  );
  const reportByServiceId = buildReportMap(reports);
  const assignmentByServiceId = new Map(
    assignments.map((a) => [a.service_id.trim(), a] as const)
  );
  const looseCoreCounts = buildMissionLooseCoreCounts(rows, reports);
  const resolveContext = { rows, looseCoreCounts };

  const assigneesByServiceId: Record<string, string> = {};
  const etaTimeByServiceId: Record<string, string | null> = {};
  const mappedCanonicalIds = new Set<string>();
  const mappedAssignmentIds = new Set<string>();

  for (const row of rows) {
    const canonical = serviceReportIdFromRow(row);
    if (!canonical) continue;

    etaTimeByServiceId[canonical] = null;

    const storedId = resolveStoredServiceIdForRow(
      row,
      storedIds,
      reportByServiceId,
      { ...resolveContext, assignmentByServiceId }
    );
    if (!storedId) continue;

    const assignment = assignmentByServiceId.get(storedId);
    if (assignment) {
      mappedAssignmentIds.add(storedId);
      const name = String(assignment.agent_name ?? "").trim();
      if (name) {
        assigneesByServiceId[canonical] = name;
        mappedCanonicalIds.add(canonical);
      }
      const eta = assignment.eta_time;
      etaTimeByServiceId[canonical] =
        typeof eta === "string" && /^\d{2}:\d{2}$/.test(eta.trim())
          ? eta.trim()
          : null;
    }
  }

  const orderFallback = reconcileOrphanAssignmentsByPrepOrder(
    rows,
    assignments,
    mappedCanonicalIds,
    mappedAssignmentIds
  );
  for (const [canonical, name] of Object.entries(orderFallback)) {
    if (!assigneesByServiceId[canonical]) {
      assigneesByServiceId[canonical] = name;
    }
  }

  return { assigneesByServiceId, etaTimeByServiceId };
}

export function resolveStoredServiceIdForPlanningRow(
  row: DailyServiceRow,
  storedIds: ReadonlySet<string>,
  reports: ReportRow[],
  allRows: DailyServiceRow[],
  assignments: AssignmentRow[] = []
): string | null {
  const reportByServiceId = buildReportMap(reports);
  const assignmentByServiceId = new Map(
    assignments.map((a) => [a.service_id.trim(), a] as const)
  );
  const looseCoreCounts = buildMissionLooseCoreCounts(allRows, reports);
  return resolveStoredServiceIdForRow(row, storedIds, reportByServiceId, {
    rows: allRows,
    looseCoreCounts,
    assignmentByServiceId,
  });
}

/** `service_id` déjà mappé vers une ligne du Sheet courant ? */
export function assignmentAlreadyMappedToRows(
  assignmentServiceId: string,
  rows: DailyServiceRow[]
): boolean {
  const id = assignmentServiceId.trim();
  if (!id) return false;
  return rows.some((row) => storedServiceIdMatchesRow(id, row));
}
