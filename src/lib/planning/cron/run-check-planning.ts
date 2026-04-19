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
const ALARM_COOLDOWN_MS = 30 * 60 * 1000;

type SnapshotV3 = {
  v: 3;
  globalHash: string;
  /** dateIso → stableKey → texte colonne assigné Sheet */
  byDate: Record<string, Record<string, string>>;
  /** dateIso → identités métier (serviceUrgencyIdentityKey) présentes à cette date */
  identitiesByDate: Record<string, string[]>;
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

function parseSnapshot(raw: unknown): SnapshotV3 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 3) return null;
  if (typeof o.globalHash !== "string") return null;
  if (!o.byDate || typeof o.byDate !== "object") return null;
  if (!o.identitiesByDate || typeof o.identitiesByDate !== "object") return null;
  return o as unknown as SnapshotV3;
}

async function canSendAlarm(
  spreadsheetId: string,
  identityKey: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin
    .from("planning_alarm_last_sent")
    .select("last_notified_at")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_identity_key", identityKey)
    .maybeSingle();
  if (error) {
    console.warn("[cron-planning] alarm lookup", error.message);
    return true;
  }
  if (!data?.last_notified_at) return true;
  const t = new Date(data.last_notified_at as string).getTime();
  return Date.now() - t >= ALARM_COOLDOWN_MS;
}

async function markAlarmSent(
  spreadsheetId: string,
  identityKey: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("planning_alarm_last_sent").upsert(
    {
      spreadsheet_id: spreadsheetId,
      service_identity_key: identityKey,
      last_notified_at: new Date().toISOString(),
    },
    { onConflict: "spreadsheet_id,service_identity_key" }
  );
}

export type PlanningCronResult = {
  ok: boolean;
  error?: string;
  bootstrapped?: boolean;
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
  const globalHash = hashGlobal(byDate);

  const { data: stateRow, error: loadErr } = await admin
    .from("planning_cron_state")
    .select("snapshot")
    .eq("spreadsheet_id", spreadsheetId)
    .maybeSingle();

  if (loadErr) {
    console.warn("[cron-planning] load state", loadErr.message);
  }

  const prev = parseSnapshot(stateRow?.snapshot);

  if (!prev?.globalHash) {
    const snap: SnapshotV3 = { v: 3, globalHash, byDate, identitiesByDate };
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
    const allowed = await canSendAlarm(spreadsheetId, id);
    if (!allowed) continue;

    const push = await broadcastAlarmUncoveredPush();
    sent.alarm += push.sent;
    anySpecific = true;
    await markAlarmSent(spreadsheetId, id);
  }

  if (!anySpecific) {
    const g = await broadcastPlanningUpdate({
      title: "📅 Planning",
      body: "Le planning a été modifié",
      openUrl: "/",
    });
    sent.general = g.sent;
  }

  const nextSnap: SnapshotV3 = {
    v: 3,
    globalHash,
    byDate,
    identitiesByDate,
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
