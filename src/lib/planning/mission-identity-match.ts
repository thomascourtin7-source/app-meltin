import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import {
  compositeMissionIdentityKey,
  normalizeClientIdentity,
  normalizeServiceRdvIdentity,
  normalizeVolIdentity,
} from "@/lib/planning/service-row-keys";
import { serviceLookupIdsFromRow } from "@/lib/reports/service-report-id";

function hasRealAssigneeName(agentName: unknown): boolean {
  return String(agentName ?? "").trim().length > 0;
}

export type MissionReportMetadata = {
  service_date?: string | null;
  service_client?: string | null;
  service_vol?: string | null;
  service_rdv1?: string | null;
  service_rdv2?: string | null;
};

function missionCoreKeyFromParts(
  dateIso: string,
  vol: string,
  client: string
): string {
  const date = normalizeCanonicalDateKey(dateIso);
  const volN = normalizeVolIdentity(vol);
  const clientN = normalizeClientIdentity(client);
  if (!date || !clientN) return "";
  // Vol parfois absent en base (brouillon) : clé date|client uniquement.
  if (!volN) return [date, clientN].join("|");
  return [date, volN, clientN].join("|");
}

export function missionCoreKeyFromRow(row: DailyServiceRow): string {
  return missionCoreKeyFromParts(row.dateIso, row.vol, row.client);
}

export function missionCoreKeyFromReport(
  report: MissionReportMetadata
): string {
  return missionCoreKeyFromParts(
    String(report.service_date ?? ""),
    String(report.service_vol ?? ""),
    String(report.service_client ?? "")
  );
}

/** Métadonnées mission (rapport Supabase) ↔ ligne Sheet (date + vol + client + RDV). */
export function reportMetadataMatchesRow(
  report: MissionReportMetadata,
  row: DailyServiceRow
): boolean {
  const reportDate = normalizeCanonicalDateKey(
    String(report.service_date ?? "").trim()
  );
  const rowDate = normalizeCanonicalDateKey(String(row.dateIso ?? "").trim());
  if (!reportDate || !rowDate || reportDate !== rowDate) return false;

  const volA = normalizeVolIdentity(String(report.service_vol ?? ""));
  const volB = normalizeVolIdentity(String(row.vol ?? ""));
  if (!volA || !volB || volA !== volB) return false;

  const clientA = normalizeClientIdentity(String(report.service_client ?? ""));
  const clientB = normalizeClientIdentity(String(row.client ?? ""));
  if (!clientA || !clientB || clientA !== clientB) return false;

  const rdvReport = normalizeServiceRdvIdentity({
    ...row,
    rdv1: String(report.service_rdv1 ?? "").trim(),
    rdv2: String(report.service_rdv2 ?? "").trim(),
  });
  const rdvRow = normalizeServiceRdvIdentity(row);
  if (rdvReport && rdvRow && rdvReport !== rdvRow) return false;

  return true;
}

/** Repli : date + client (+ vol si connu côté rapport). RDV ignoré. */
export function reportMetadataLooseMatchesRow(
  report: MissionReportMetadata,
  row: DailyServiceRow
): boolean {
  const reportDate = normalizeCanonicalDateKey(
    String(report.service_date ?? "").trim()
  );
  const rowDate = normalizeCanonicalDateKey(String(row.dateIso ?? "").trim());
  if (!reportDate || !rowDate || reportDate !== rowDate) return false;

  const clientA = normalizeClientIdentity(String(report.service_client ?? ""));
  const clientB = normalizeClientIdentity(String(row.client ?? ""));
  if (!clientA || !clientB || clientA !== clientB) return false;

  const reportVol = normalizeVolIdentity(String(report.service_vol ?? ""));
  const rowVol = normalizeVolIdentity(String(row.vol ?? ""));
  if (reportVol) {
    if (!rowVol || reportVol !== rowVol) return false;
  }

  return true;
}

function clientDayKeyFromRow(row: DailyServiceRow): string {
  const date = normalizeCanonicalDateKey(String(row.dateIso ?? "").trim());
  const client = normalizeClientIdentity(String(row.client ?? ""));
  if (!date || !client) return "";
  return [date, client].join("|");
}

function clientDayKeyFromReport(report: MissionReportMetadata): string {
  const date = normalizeCanonicalDateKey(String(report.service_date ?? "").trim());
  const client = normalizeClientIdentity(String(report.service_client ?? ""));
  if (!date || !client) return "";
  return [date, client].join("|");
}

/** Toutes les clés connues d'une ligne (native + replis). */
export function lookupIdSetForRow(row: DailyServiceRow): Set<string> {
  return new Set(serviceLookupIdsFromRow(row));
}

/** `service_id` stocké correspond-il à cette ligne (clé native ou repli) ? */
export function storedServiceIdMatchesRow(
  storedServiceId: string,
  row: DailyServiceRow
): boolean {
  const id = storedServiceId.trim();
  if (!id) return false;
  return lookupIdSetForRow(row).has(id);
}

function buildLooseCoreCounts(
  rows: DailyServiceRow[],
  reports: ReadonlyMap<string, MissionReportMetadata>
): {
  rowCoreCounts: Map<string, number>;
  reportCoreCounts: Map<string, number>;
} {
  const rowCoreCounts = new Map<string, number>();
  for (const row of rows) {
    const core = missionCoreKeyFromRow(row);
    if (!core) continue;
    rowCoreCounts.set(core, (rowCoreCounts.get(core) ?? 0) + 1);
  }
  const reportCoreCounts = new Map<string, number>();
  for (const report of reports.values()) {
    const core = missionCoreKeyFromReport(report);
    if (!core) continue;
    reportCoreCounts.set(core, (reportCoreCounts.get(core) ?? 0) + 1);
  }
  return { rowCoreCounts, reportCoreCounts };
}

/**
 * Pour une ligne Sheet, retrouve le `service_id` stocké en base le plus
 * pertinent (native actuelle, repli composite, ou ancien Id migré via rapport).
 */
export function resolveStoredServiceIdForRow(
  row: DailyServiceRow,
  storedIds: ReadonlySet<string>,
  reportByServiceId: ReadonlyMap<string, MissionReportMetadata>,
  context?: {
    rows?: DailyServiceRow[];
    looseCoreCounts?: {
      rowCoreCounts: Map<string, number>;
      reportCoreCounts: Map<string, number>;
    };
    assignmentByServiceId?: ReadonlyMap<
      string,
      { agent_name?: string | null }
    >;
  }
): string | null {
  const canonical =
    String(row.sheetId ?? "").trim() || compositeMissionIdentityKey(row);

  const candidates: string[] = [];
  const pushCandidate = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || !storedIds.has(trimmed)) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };

  pushCandidate(canonical);
  for (const id of serviceLookupIdsFromRow(row)) pushCandidate(id);

  for (const storedId of storedIds) {
    if (storedServiceIdMatchesRow(storedId, row)) pushCandidate(storedId);
    const report = reportByServiceId.get(storedId);
    if (report && reportMetadataMatchesRow(report, row)) pushCandidate(storedId);
  }

  const looseCounts =
    context?.looseCoreCounts ??
    (context?.rows
      ? buildLooseCoreCounts(context.rows, reportByServiceId)
      : null);
  const rowCore = missionCoreKeyFromRow(row);
  if (looseCounts && rowCore) {
    for (const storedId of storedIds) {
      const report = reportByServiceId.get(storedId);
      if (!report || !reportMetadataLooseMatchesRow(report, row)) continue;
      const reportVol = normalizeVolIdentity(String(report.service_vol ?? ""));
      if (!reportVol) {
        const clientDay = clientDayKeyFromRow(row);
        if (!clientDay) continue;
        const rowClientCount = context?.rows
          ? context.rows.filter((r) => clientDayKeyFromRow(r) === clientDay)
              .length
          : 1;
        const reportClientCount = [...reportByServiceId.values()].filter(
          (r) => clientDayKeyFromReport(r) === clientDay
        ).length;
        if (rowClientCount !== 1 || reportClientCount !== 1) continue;
      } else if (
        (looseCounts.rowCoreCounts.get(rowCore) ?? 0) !== 1 ||
        (looseCounts.reportCoreCounts.get(rowCore) ?? 0) !== 1
      ) {
        continue;
      }
      pushCandidate(storedId);
    }
  }

  if (candidates.length === 0) return null;

  const assignmentByServiceId = context?.assignmentByServiceId;
  const withAgent = candidates.find((id) =>
    hasRealAssigneeName(assignmentByServiceId?.get(id)?.agent_name)
  );
  if (withAgent) return withAgent;

  const withReport = candidates.find((id) => reportByServiceId.has(id));
  if (withReport) return withReport;

  return candidates[0] ?? null;
}

/** Pré-calcul des compteurs « core » pour réconciliation par journée. */
export function buildMissionLooseCoreCounts(
  rows: DailyServiceRow[],
  reports: MissionReportMetadata[]
): {
  rowCoreCounts: Map<string, number>;
  reportCoreCounts: Map<string, number>;
} {
  const reportMap = new Map(
    reports.map((r, i) => [`__idx_${i}`, r] as const)
  );
  return buildLooseCoreCounts(rows, reportMap);
}
