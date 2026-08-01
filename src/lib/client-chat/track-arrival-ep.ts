import {
  isArrivalServiceType,
  isDepartureServiceType,
  resolveServiceReportKind,
} from "@/lib/planning/service-kind";

export const ARRIVAL_EP_BLOC_MESSAGE =
  "Agent ready at the gate ( end of the jetbridge with a sign )";

export const ARRIVAL_EP_LARGE_MESSAGE =
  "Remote gate - deplanning by bus - agent is waiting at the bus terminal .";

function normalizeTypeField(typeRaw: string): string {
  return typeRaw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isArrTransServiceType(typeRaw: string | null | undefined): boolean {
  const norm = normalizeTypeField(String(typeRaw ?? ""));
  return norm.includes("arr") && norm.includes("trans");
}

/** Arrivée ou ARR+TRANS — messages E.P BLOCK / LARGE dédiés D.O. */
export function isDoTrackArrivalEpMessage(
  serviceType: string | null | undefined,
  reportKind: string | null | undefined
): boolean {
  if (isDepartureServiceType(serviceType ?? undefined)) return false;
  const stored = (reportKind ?? "").trim().toLowerCase();
  if (stored === "arrival") return true;
  if (isArrivalServiceType(serviceType ?? undefined)) return true;
  if (isArrTransServiceType(serviceType)) return true;
  return (
    resolveServiceReportKind({
      reportKindStored: reportKind,
      serviceType,
    }) === "arrival"
  );
}
