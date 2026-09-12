import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
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
      const name = String(assignment.agent_name ?? "").trim();
      if (name) {
        assigneesByServiceId[canonical] = name;
      }
      const eta = assignment.eta_time;
      etaTimeByServiceId[canonical] =
        typeof eta === "string" && /^\d{2}:\d{2}$/.test(eta.trim())
          ? eta.trim()
          : null;
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
