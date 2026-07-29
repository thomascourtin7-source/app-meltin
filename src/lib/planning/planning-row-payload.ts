import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";

/** Payload minimal des lignes Sheet (réconciliation Id migré). */
export type PlanningRowPayload = Pick<
  DailyServiceRow,
  | "sheetId"
  | "dateIso"
  | "client"
  | "type"
  | "vol"
  | "rdv1"
  | "rdv2"
  | "tel"
  | "driverInfo"
  | "destProv"
  | "sheetAssignee"
>;

export function parsePlanningRowPayloads(raw: unknown): PlanningRowPayload[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanningRowPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      sheetId: typeof o.sheetId === "string" ? o.sheetId : "",
      dateIso:
        typeof o.dateIso === "string"
          ? normalizeCanonicalDateKey(o.dateIso)
          : "",
      client: typeof o.client === "string" ? o.client : "",
      type: typeof o.type === "string" ? o.type : "",
      vol: typeof o.vol === "string" ? o.vol : "",
      rdv1: typeof o.rdv1 === "string" ? o.rdv1 : "",
      rdv2: typeof o.rdv2 === "string" ? o.rdv2 : "",
      tel: typeof o.tel === "string" ? o.tel : "",
      driverInfo: typeof o.driverInfo === "string" ? o.driverInfo : "",
      destProv: typeof o.destProv === "string" ? o.destProv : "",
      sheetAssignee: typeof o.sheetAssignee === "string" ? o.sheetAssignee : "",
    });
  }
  return out;
}

export function parseServiceDateParam(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return normalizeCanonicalDateKey(raw.trim()).slice(0, 10);
}
