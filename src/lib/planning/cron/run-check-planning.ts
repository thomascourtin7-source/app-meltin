import { createHash } from "crypto";

import { DateTime } from "luxon";

import { fetchDailyServicesFromSheet } from "@/lib/google/fetch-daily-services";
import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { normalizeCanonicalDateKey } from "@/lib/planning/daily-services";
import { formatPlanningDateForNotification } from "@/lib/planning/push-format";
import {
  broadcastAlarmUncoveredPush,
  broadcastPlanningUpdate,
} from "@/lib/push/send-notification";
import { notifyPlanningAssigneeSubscribers } from "@/lib/push/notify-planning-assignee";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { matchSheetAssigneeToTeamLabel } from "@/lib/planning/planning-team";
import {
  serviceUrgencyIdentityKey,
  stableServiceRowKey,
} from "@/lib/planning/service-row-keys";

const ZONE = "Europe/Paris";

type SnapshotV4 = {
  v: 4;
  globalHash: string;
  /** dateIso → stableKey → texte colonne assigné Sheet */
  byDate: Record<string, Record<string, string>>;
  /** dateIso → identités métier (serviceUrgencyIdentityKey) présentes à cette date */
  identitiesByDate: Record<string, string[]>;
  /** dateIso → stableKey → hash SHA-256 du contenu ligne (changement précis) */
  rowHashes: Record<string, Record<string, string>>;
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function buildByDate(rows: DailyServiceRow[]): Record<string, Record<string, string>> {
  const byDate: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const dk = normalizeCanonicalDateKey(row.dateIso);
    if (!byDate[dk]) byDate[dk] = {};
    byDate[dk][stableServiceRowKey(row)] = row.sheetAssignee.trim();
  }
  return byDate;
}

function buildIdentitiesByDate(
  rows: DailyServiceRow[]
): Record<string, string[]> {
  const m: Record<string, Set<string>> = {};
  for (const row of rows) {
    const dk = normalizeCanonicalDateKey(row.dateIso);
    if (!m[dk]) m[dk] = new Set();
    m[dk].add(serviceUrgencyIdentityKey(row));
  }
  const out: Record<string, string[]> = {};
  for (const [dk, set] of Object.entries(m)) {
    out[dk] = [...set].sort();
  }
  return out;
}

function hashGlobal(
  byDate: Record<string, Record<string, string>>
): string {
  const dates = Object.keys(byDate).sort();
  const parts: string[] = [];
  for (const d of dates) {
    const keys = Object.keys(byDate[d]).sort();
    for (const k of keys) {
      parts.push(`${d}|${k}|${byDate[d][k]}`);
    }
  }
  return sha256Hex(parts.join("\n"));
}

/** Ordre stable : même contenu → même hash global (indépendant de l’ordre des clés objet). */
function hashRowHashesTree(
  rowHashes: Record<string, Record<string, string>>
): string {
  const dates = Object.keys(rowHashes).sort();
  const parts: string[] = [];
  for (const d of dates) {
    const keys = Object.keys(rowHashes[d]).sort();
    for (const k of keys) {
      parts.push(`${d}|${k}|${rowHashes[d][k]}`);
    }
  }
  return sha256Hex(parts.join("\n"));
}

/** Hash par ligne (contenu métier + assignation) pour comparer finement les changements. */
function rowContentHash(row: DailyServiceRow): string {
  const line = [
    stableServiceRowKey(row),
    row.sheetAssignee.trim(),
    row.type.trim(),
    row.destProv.trim(),
    normalizeCanonicalDateKey(row.dateIso),
    String(row.client ?? "").trim(),
    String(row.vol ?? "").trim(),
  ].join("\x1f");
  return sha256Hex(line);
}

function buildRowHashes(
  rows: DailyServiceRow[]
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const dk = normalizeCanonicalDateKey(row.dateIso);
    if (!out[dk]) out[dk] = {};
    out[dk][stableServiceRowKey(row)] = rowContentHash(row);
  }
  return out;
}

function parisTodayYmd(): string {
  return DateTime.now().setZone(ZONE).toISODate() ?? "";
}

function parisTomorrowYmd(): string {
  return DateTime.now().setZone(ZONE).plus({ days: 1 }).toISODate() ?? "";
}

function dayBucketIso(dateIso: string): "today" | "tomorrow" | "other" {
  const t = parisTodayYmd();
  const tm = parisTomorrowYmd();
  const k = normalizeCanonicalDateKey(dateIso);
  if (k === t) return "today";
  if (k === tm) return "tomorrow";
  return "other";
}

function assigneePushTitle(dateIso: string): string {
  const b = dayBucketIso(dateIso);
  if (b === "today") return "📅 Aujourd'hui : Planning mis à jour";
  if (b === "tomorrow") return "📅 Demain : Planning mis à jour";
  return "📅 Planning mis à jour";
}

function volRetireTitle(dateIso: string): string {
  const b = dayBucketIso(dateIso);
  const inner =
    b === "today"
      ? "Aujourd'hui"
      : b === "tomorrow"
        ? "Demain"
        : formatPlanningDateForNotification(dateIso);
  return `❌ Vol retiré (${inner})`;
}

function labelFromSheetRaw(raw: string): string | null {
  return matchSheetAssigneeToTeamLabel(raw.trim());
}

function sheetRowAlarmCandidateRaw(assigneeRaw: string): boolean {
  const raw = assigneeRaw.trim();
  if (!raw) return false;
  if (!raw.includes("🚨")) return false;
  return labelFromSheetRaw(raw) === null;
}

type ParsedSnapshot = {
  snapshot: SnapshotV4;
  /** Snapshot DB encore en v3 (sans rowHashes / nouveau globalHash) → migration silencieuse. */
  isLegacyV3: boolean;
};

function parseSnapshot(raw: unknown): ParsedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 3 && o.v !== 4) return null;
  if (typeof o.globalHash !== "string") return null;
  if (!o.byDate || typeof o.byDate !== "object") return null;
  if (!o.identitiesByDate || typeof o.identitiesByDate !== "object") return null;
  const isLegacyV3 = o.v === 3;
  const rowHashes =
    o.v === 4 &&
    o.rowHashes &&
    typeof o.rowHashes === "object" &&
    o.rowHashes !== null
      ? (o.rowHashes as Record<string, Record<string, string>>)
      : {};
  return {
    isLegacyV3,
    snapshot: {
      v: 4,
      globalHash: o.globalHash,
      byDate: o.byDate as Record<string, Record<string, string>>,
      identitiesByDate: o.identitiesByDate as Record<string, string[]>,
      rowHashes,
    },
  };
}

/** Au plus une alarme 🚨 par service et par jour calendaire (Paris). */
async function canSendAlarmToday(
  spreadsheetId: string,
  identityKey: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const day = parisTodayYmd();
  const { data, error } = await admin
    .from("sent_alarms")
    .select("spreadsheet_id")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_identity_key", identityKey)
    .eq("sent_on", day)
    .maybeSingle();
  if (error) {
    console.warn("[check-planning] sent_alarms lookup", error.message);
    return false;
  }
  return !data;
}

async function markAlarmSentToday(
  spreadsheetId: string,
  identityKey: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("sent_alarms").upsert(
    {
      spreadsheet_id: spreadsheetId,
      service_identity_key: identityKey,
      sent_on: parisTodayYmd(),
      notified_at: new Date().toISOString(),
    },
    { onConflict: "spreadsheet_id,service_identity_key,sent_on" }
  );
}

export type PlanningCronResult = {
  ok: boolean;
  error?: string;
  bootstrapped?: boolean;
  /** v3 → v4 : snapshot réécrit sans envoyer de push. */
  migratedSnapshot?: boolean;
  skippedUnchanged?: boolean;
  globalHashChanged: boolean;
  sent: {
    general: number;
    assignee: number;
    volRetire: number;
    alarm: number;
  };
};

export async function executePlanningCronCheck(
  spreadsheetId: string
): Promise<PlanningCronResult> {
  const emptySent = { general: 0, assignee: 0, volRetire: 0, alarm: 0 };

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY manquant",
      globalHashChanged: false,
      sent: emptySent,
    };
  }

  let rows: DailyServiceRow[];
  try {
    const res = await fetchDailyServicesFromSheet(spreadsheetId);
    rows = res.rows;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch sheet";
    return {
      ok: false,
      error: msg,
      globalHashChanged: false,
      sent: emptySent,
    };
  }

  const byDate = buildByDate(rows);
  const identitiesByDate = buildIdentitiesByDate(rows);
  const rowHashes = buildRowHashes(rows);
  const globalHash = sha256Hex(
    `${hashGlobal(byDate)}\n${hashRowHashesTree(rowHashes)}`
  );

  const { data: stateRow, error: loadErr } = await admin
    .from("planning_cron_state")
    .select("snapshot")
    .eq("spreadsheet_id", spreadsheetId)
    .maybeSingle();

  if (loadErr) {
    console.warn("[cron-planning] load state", loadErr.message);
  }

  const parsed = parseSnapshot(stateRow?.snapshot);
  const prev = parsed?.snapshot;

  if (!prev?.globalHash) {
    const snap: SnapshotV4 = {
      v: 4,
      globalHash,
      byDate,
      identitiesByDate,
      rowHashes,
    };
    await admin.from("planning_cron_state").upsert(
      {
        spreadsheet_id: spreadsheetId,
        snapshot: snap as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "spreadsheet_id" }
    );
    return {
      ok: true,
      bootstrapped: true,
      globalHashChanged: true,
      sent: emptySent,
    };
  }

  if (parsed?.isLegacyV3) {
    const snap: SnapshotV4 = {
      v: 4,
      globalHash,
      byDate,
      identitiesByDate,
      rowHashes,
    };
    await admin.from("planning_cron_state").upsert(
      {
        spreadsheet_id: spreadsheetId,
        snapshot: snap as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "spreadsheet_id" }
    );
    return {
      ok: true,
      migratedSnapshot: true,
      globalHashChanged: true,
      sent: emptySent,
    };
  }

  if (prev.globalHash === globalHash) {
    return {
      ok: true,
      skippedUnchanged: true,
      globalHashChanged: false,
      sent: emptySent,
    };
  }

  let anySpecific = false;
  const sent = { ...emptySent };

  const dateKeys = new Set([
    ...Object.keys(prev.byDate ?? {}),
    ...Object.keys(byDate),
  ]);

  for (const dateKey of dateKeys) {
    const prevMap = prev.byDate?.[dateKey] ?? {};
    const nextMap = byDate[dateKey] ?? {};

    for (const stableKey of Object.keys(prevMap)) {
      const prevRaw = (prevMap[stableKey] ?? "").trim();
      const prevLabel = labelFromSheetRaw(prevRaw);
      if (!prevLabel) continue;

      const nextExists = stableKey in nextMap;
      const nextRaw = nextExists ? (nextMap[stableKey] ?? "").trim() : "";
      const nextLabel =
        nextRaw !== "" ? labelFromSheetRaw(nextRaw) : null;

      const stillSame =
        nextExists && nextLabel !== null && nextLabel === prevLabel;
      if (stillSame) continue;

      const r = await notifyPlanningAssigneeSubscribers(prevLabel, {
        title: volRetireTitle(dateKey),
        body: "Un service vous a été retiré. Vérifiez votre planning.",
      });
      sent.volRetire += r.sent;
      anySpecific = true;
    }

    for (const stableKey of Object.keys(nextMap)) {
      const prevRaw = (prevMap[stableKey] ?? "").trim();
      const nextRaw = (nextMap[stableKey] ?? "").trim();
      if (prevRaw === nextRaw) continue;

      const target = labelFromSheetRaw(nextRaw);
      if (!target) continue;

      const prevTarget = labelFromSheetRaw(prevRaw);
      if (prevTarget === target) continue;

      const r = await notifyPlanningAssigneeSubscribers(target, {
        title: assigneePushTitle(dateKey),
        body: "Votre planning a été modifié. Cliquez pour voir.",
      });
      sent.assignee += r.sent;
      anySpecific = true;
    }
  }

  const todayY = parisTodayYmd();

  for (const row of rows) {
    if (normalizeCanonicalDateKey(row.dateIso) !== todayY) continue;
    const sk = stableServiceRowKey(row);
    const nextRaw = row.sheetAssignee.trim();
    const prevRaw = (prev.byDate?.[todayY]?.[sk] ?? "").trim();
    if (!sheetRowAlarmCandidateRaw(nextRaw)) continue;
    if (sheetRowAlarmCandidateRaw(prevRaw)) continue;

    const id = serviceUrgencyIdentityKey(row);
    const allowed = await canSendAlarmToday(spreadsheetId, id);
    if (!allowed) continue;

    const push = await broadcastAlarmUncoveredPush();
    sent.alarm += push.sent;
    anySpecific = true;
    await markAlarmSentToday(spreadsheetId, id);
  }

  if (!anySpecific) {
    const g = await broadcastPlanningUpdate({
      title: "📅 Planning",
      body: "Le planning a été modifié",
      openUrl: "/",
    });
    sent.general = g.sent;
  }

  const nextSnap: SnapshotV4 = {
    v: 4,
    globalHash,
    byDate,
    identitiesByDate,
    rowHashes,
  };
  await admin.from("planning_cron_state").upsert(
    {
      spreadsheet_id: spreadsheetId,
      snapshot: nextSnap as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "spreadsheet_id" }
  );

  return {
    ok: true,
    globalHashChanged: true,
    sent,
  };
}
