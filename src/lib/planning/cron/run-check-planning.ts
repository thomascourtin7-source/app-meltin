import { createHash } from "crypto";

import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const LOG_PREFIX = "[check-planning]";

const REMINDER_WINDOW_MS = 6 * 60 * 1000; // fenêtre pour rattraper un cron pas à la seconde
const NOTIF_IDLE_MS = 5000; // debounce : envoyer après 5s d'inactivité

type SnapshotV4 = {
  v: 4;
  globalHash: string;
  /** dateIso → stableKey → texte colonne assigné Sheet */
  byDate: Record<string, Record<string, string>>;
  /** dateIso → identités métier (serviceUrgencyIdentityKey) présentes à cette date */
  identitiesByDate: Record<string, string[]>;
  /** dateIso → stableKey → hash SHA-256 du contenu ligne */
  rowHashes: Record<string, Record<string, string>>;
};

type RowSummaryV1 = {
  client: string;
  vol: string;
  rdv1: string;
  rdv2: string;
  type: string;
  destProv: string;
  tel: string;
  driverInfo: string;
};

type SnapshotV5 = {
  v: 5;
  globalHash: string;
  byDate: Record<string, Record<string, string>>;
  identitiesByDate: Record<string, string[]>;
  rowHashes: Record<string, Record<string, string>>;
  /** dateIso → stableKey → résumé des champs pour messages de notification. */
  rowSummaries: Record<string, Record<string, RowSummaryV1>>;
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

function hashGlobal(byDate: Record<string, Record<string, string>>): string {
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

function rowContentHash(row: DailyServiceRow): string {
  const line = [
    stableServiceRowKey(row),
    row.sheetAssignee.trim(),
    row.type.trim(),
    row.destProv.trim(),
    normalizeCanonicalDateKey(row.dateIso),
    String(row.client ?? "").trim(),
    String(row.vol ?? "").trim(),
    String(row.rdv1 ?? "").trim(),
    String(row.rdv2 ?? "").trim(),
    String(row.tel ?? "").trim(),
    String(row.driverInfo ?? "").trim(),
  ].join("\x1f");
  return sha256Hex(line);
}

function buildRowSummaries(
  rows: DailyServiceRow[]
): Record<string, Record<string, RowSummaryV1>> {
  const out: Record<string, Record<string, RowSummaryV1>> = {};
  for (const row of rows) {
    const dk = normalizeCanonicalDateKey(row.dateIso);
    if (!out[dk]) out[dk] = {};
    out[dk][stableServiceRowKey(row)] = {
      client: String(row.client ?? "").trim(),
      vol: String(row.vol ?? "").trim(),
      rdv1: String(row.rdv1 ?? "").trim(),
      rdv2: String(row.rdv2 ?? "").trim(),
      type: String(row.type ?? "").trim(),
      destProv: String(row.destProv ?? "").trim(),
      tel: String(row.tel ?? "").trim(),
      driverInfo: String(row.driverInfo ?? "").trim(),
    };
  }
  return out;
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

function prefixIfTomorrow(dateIso: string): string {
  return dayBucketIso(dateIso) === "tomorrow" ? "DEMAIN : " : "";
}

function assigneePushTitle(serviceDateYmd: string): string {
  const b = dayBucketIso(serviceDateYmd);
  if (b === "today") return "📅 Aujourd'hui : Planning mis à jour";
  if (b === "tomorrow") return "📅 Demain : Planning mis à jour";
  return "📅 Planning mis à jour";
}

function volRetireTitle(serviceDateYmd: string): string {
  const b = dayBucketIso(serviceDateYmd);
  const inner =
    b === "today"
      ? "Aujourd'hui"
      : b === "tomorrow"
        ? "Demain"
        : formatPlanningDateForNotification(serviceDateYmd);
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

function hasAlarmEmoji(row: DailyServiceRow): boolean {
  return String(row.sheetAssignee ?? "").includes("🚨");
}

function normalizeServiceType(raw: string): "arrival" | "transit" | "departure" {
  const t = (raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t.includes("depart")) return "departure";
  if (t.includes("transit")) return "transit";
  return "arrival";
}

function parseRdvToDateTime(dateIso: string, rdvRaw: string): DateTime | null {
  const s = (rdvRaw || "").trim();
  if (!s) return null;
  // formats tolérés: "06:30", "6:30", "06h30", "6h30"
  const m = /^(\d{1,2})\s*(?:[:hH])\s*(\d{2})/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return DateTime.fromISO(normalizeCanonicalDateKey(dateIso), { zone: ZONE }).set({
    hour: hh,
    minute: mm,
    second: 0,
    millisecond: 0,
  });
}

type ParsedSnapshot = {
  snapshot: SnapshotV4 | SnapshotV5;
  isLegacyV3: boolean;
  isLegacyV4: boolean;
};

function parseSnapshot(raw: unknown): ParsedSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 3 && o.v !== 4 && o.v !== 5) return null;
  if (typeof o.globalHash !== "string") return null;
  if (!o.byDate || typeof o.byDate !== "object") return null;
  if (!o.identitiesByDate || typeof o.identitiesByDate !== "object") return null;
  const isLegacyV3 = o.v === 3;
  const isLegacyV4 = o.v === 4;
  const rowHashes =
    (o.v === 4 || o.v === 5) &&
    o.rowHashes &&
    typeof o.rowHashes === "object" &&
    o.rowHashes !== null
      ? (o.rowHashes as Record<string, Record<string, string>>)
      : {};
  const rowSummaries =
    o.v === 5 &&
    o.rowSummaries &&
    typeof o.rowSummaries === "object" &&
    o.rowSummaries !== null
      ? (o.rowSummaries as Record<string, Record<string, RowSummaryV1>>)
      : {};
  return {
    isLegacyV3,
    isLegacyV4,
    snapshot: {
      v: 5,
      globalHash: o.globalHash,
      byDate: o.byDate as Record<string, Record<string, string>>,
      identitiesByDate: o.identitiesByDate as Record<string, string[]>,
      rowHashes,
      rowSummaries,
    },
  };
}

function buildSnapshotV5(
  byDate: Record<string, Record<string, string>>,
  identitiesByDate: Record<string, string[]>,
  rowHashes: Record<string, Record<string, string>>,
  rowSummaries: Record<string, Record<string, RowSummaryV1>>,
  globalHash: string
): SnapshotV5 {
  return { v: 5, globalHash, byDate, identitiesByDate, rowHashes, rowSummaries };
}

/** Log demandé pour Vercel : cible + type de changement. */
function logChangeDetected(
  target: string,
  type: string,
  detail?: Record<string, unknown>
): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log("Changement détecté pour", target, type, detail);
  } else {
    console.log("Changement détecté pour", target, type);
  }
}

async function loadPreviousPlanningState(
  admin: SupabaseClient,
  spreadsheetId: string
): Promise<{ parsed: ParsedSnapshot | null; source: "planning_states" | "legacy_cron" | "none" }> {
  const primary = await admin
    .from("planning_states")
    .select("snapshot")
    .eq("spreadsheet_id", spreadsheetId)
    .maybeSingle();

  if (primary.error) {
    console.warn(`${LOG_PREFIX} lecture planning_states`, primary.error.message);
  }
  if (primary.data?.snapshot) {
    const parsed = parseSnapshot(primary.data.snapshot);
    if (parsed) {
      console.log(`${LOG_PREFIX} état précédent chargé depuis planning_states`);
      return { parsed, source: "planning_states" };
    }
  }

  const legacy = await admin
    .from("planning_cron_state")
    .select("snapshot")
    .eq("spreadsheet_id", spreadsheetId)
    .maybeSingle();

  if (legacy.error) {
    console.warn(`${LOG_PREFIX} lecture planning_cron_state`, legacy.error.message);
  }
  if (legacy.data?.snapshot) {
    const parsed = parseSnapshot(legacy.data.snapshot);
    if (parsed) {
      console.log(
        `${LOG_PREFIX} état précédent chargé depuis planning_cron_state (migration vers planning_states)`
      );
      return { parsed, source: "legacy_cron" };
    }
  }

  console.log(`${LOG_PREFIX} aucun état précédent (premier run ou table vide)`);
  return { parsed: null, source: "none" };
}

async function persistPlanningState(
  admin: SupabaseClient,
  spreadsheetId: string,
  snap: SnapshotV4 | SnapshotV5,
  reason: string
): Promise<boolean> {
  const { error } = await admin.from("planning_states").upsert(
    {
      spreadsheet_id: spreadsheetId,
      snapshot: snap as unknown as Record<string, unknown>,
      global_hash: snap.globalHash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "spreadsheet_id" }
  );
  if (error) {
    console.error(`${LOG_PREFIX} échec enregistrement planning_states (${reason})`, error.message);
    return false;
  }
  console.log(`${LOG_PREFIX} copie planning enregistrée`, {
    spreadsheetId,
    reason,
    globalHash: snap.globalHash.slice(0, 24) + "…",
    rowsBucketCount: Object.keys(snap.byDate).length,
  });
  return true;
}

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
    console.warn(`${LOG_PREFIX} sent_alarms lookup`, error.message);
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

async function canSendReminderToday(
  spreadsheetId: string,
  identityKey: string,
  reminderKind: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const day = parisTodayYmd();
  const { data, error } = await admin
    .from("sent_planning_reminders")
    .select("spreadsheet_id")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_identity_key", identityKey)
    .eq("reminder_kind", reminderKind)
    .eq("sent_on", day)
    .maybeSingle();
  if (error) {
    console.warn(`${LOG_PREFIX} sent_planning_reminders lookup`, error.message);
    return false;
  }
  return !data;
}

async function markReminderSentToday(
  spreadsheetId: string,
  identityKey: string,
  reminderKind: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("sent_planning_reminders").upsert(
    {
      spreadsheet_id: spreadsheetId,
      service_identity_key: identityKey,
      reminder_kind: reminderKind,
      sent_on: parisTodayYmd(),
      notified_at: new Date().toISOString(),
    },
    { onConflict: "spreadsheet_id,service_identity_key,reminder_kind,sent_on" }
  );
}

type PendingNotifRow = {
  spreadsheet_id: string;
  date_key: string;
  stable_row_key: string;
  kind: string;
  target_name: string;
  title: string;
  body: string;
  open_url: string;
  last_hash: string;
  last_seen_at: string;
  sent_at: string | null;
};

async function upsertPendingNotification(
  admin: SupabaseClient,
  row: Omit<PendingNotifRow, "sent_at" | "last_seen_at">
): Promise<void> {
  await admin.from("planning_pending_notifications").upsert(
    {
      ...row,
      last_seen_at: new Date().toISOString(),
      sent_at: null,
    },
    {
      onConflict: "spreadsheet_id,date_key,stable_row_key,kind,target_name",
    }
  );
}

async function flushDuePendingNotifications(
  admin: SupabaseClient,
  spreadsheetId: string
): Promise<number> {
  const now = DateTime.now().setZone(ZONE);
  const cutoffIso = now.minus({ milliseconds: NOTIF_IDLE_MS }).toISO();
  if (!cutoffIso) return 0;

  const { data, error } = await admin
    .from("planning_pending_notifications")
    .select("*")
    .eq("spreadsheet_id", spreadsheetId)
    .is("sent_at", null)
    .lt("last_seen_at", cutoffIso)
    .limit(200);

  if (error || !data?.length) return 0;

  let sentCount = 0;
  for (const raw of data as unknown as PendingNotifRow[]) {
    const target = raw.target_name?.trim();
    if (!target) continue;
    const r = await notifyPlanningAssigneeSubscribers(
      target,
      {
        title: raw.title,
        body: raw.body,
        openUrl: raw.open_url,
      }
    );
    sentCount += r.sent;
    await admin
      .from("planning_pending_notifications")
      .update({ sent_at: new Date().toISOString() })
      .eq("spreadsheet_id", raw.spreadsheet_id)
      .eq("date_key", raw.date_key)
      .eq("stable_row_key", raw.stable_row_key)
      .eq("kind", raw.kind)
      .eq("target_name", raw.target_name);
  }
  return sentCount;
}

export type PlanningCronResult = {
  ok: boolean;
  error?: string;
  bootstrapped?: boolean;
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
    console.error(`${LOG_PREFIX} SUPABASE_SERVICE_ROLE_KEY manquant`);
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
    console.log(`${LOG_PREFIX} Sheet lu`, { spreadsheetId, ligneCount: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch sheet";
    console.error(`${LOG_PREFIX} erreur fetch Sheet`, msg);
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
  const rowSummaries = buildRowSummaries(rows);
  const globalHash = sha256Hex(
    `${hashGlobal(byDate)}\n${hashRowHashesTree(rowHashes)}`
  );

  const { parsed, source: stateSource } = await loadPreviousPlanningState(
    admin,
    spreadsheetId
  );
  const prev = parsed?.snapshot;
  const nextSnap = buildSnapshotV5(
    byDate,
    identitiesByDate,
    rowHashes,
    rowSummaries,
    globalHash
  );

  if (!prev?.globalHash) {
    await persistPlanningState(admin, spreadsheetId, nextSnap, "bootstrap");
    console.log(`${LOG_PREFIX} premier enregistrement — pas de notifications (baseline)`);
    return {
      ok: true,
      bootstrapped: true,
      globalHashChanged: true,
      sent: emptySent,
    };
  }

  if (parsed?.isLegacyV3) {
    await persistPlanningState(
      admin,
      spreadsheetId,
      nextSnap,
      "migration-v3→v4"
    );
    console.log(`${LOG_PREFIX} migration snapshot v3 → v4 sans notifications`);
    return {
      ok: true,
      migratedSnapshot: true,
      globalHashChanged: true,
      sent: emptySent,
    };
  }

  if (parsed?.isLegacyV4) {
    await persistPlanningState(
      admin,
      spreadsheetId,
      nextSnap,
      "migration-v4→v5"
    );
    console.log(`${LOG_PREFIX} migration snapshot v4 → v5 sans notifications`);
    return {
      ok: true,
      migratedSnapshot: true,
      globalHashChanged: true,
      sent: emptySent,
    };
  }

  if (prev.globalHash === globalHash) {
    await persistPlanningState(
      admin,
      spreadsheetId,
      nextSnap,
      "refresh-lecture-identique"
    );
    console.log(`${LOG_PREFIX} hash global identique — pas de diff, état rafraîchi en DB`);
    return {
      ok: true,
      skippedUnchanged: true,
      globalHashChanged: false,
      sent: emptySent,
    };
  }

  console.log(`${LOG_PREFIX} hash global différent`, {
    prev: prev.globalHash.slice(0, 24) + "…",
    next: globalHash.slice(0, 24) + "…",
    stateSource,
  });

  let anySpecific = false;
  const sent = { ...emptySent };

  const dateKeys = new Set([
    ...Object.keys(prev.byDate ?? {}),
    ...Object.keys(byDate),
  ]);

  const todayY = parisTodayYmd();
  const tomorrowY = parisTomorrowYmd();

  /** Nouveau service : aujourd’hui uniquement → diffusion à tous avec détails. */
  {
    const dk = todayY;
    const prevHashes = (prev.rowHashes?.[dk] ?? {}) as Record<string, string>;
    const nextHashes = (rowHashes?.[dk] ?? {}) as Record<string, string>;
    const nextSumm = (rowSummaries?.[dk] ?? {}) as Record<string, RowSummaryV1>;
    for (const stableKey of Object.keys(nextHashes)) {
      if (stableKey in prevHashes) continue;
      const s = nextSumm[stableKey];
      if (!s) continue;
      const rdv = (s.rdv1 || s.rdv2 || "—").trim() || "—";
      const vol = (s.vol || "—").trim() || "—";
      const client = (s.client || "—").trim() || "—";
      logChangeDetected("tous les abonnés", "nouveau-service-aujourd-hui", {
        dateService: dk,
        stableKey: stableKey.slice(0, 80),
      });
      const g = await broadcastPlanningUpdate({
        title: "🚨 Nouveau service ajouté",
        body: `🚨 Nouveau service ajouté : ${vol} - ${client} à ${rdv}`,
        openUrl: "/planning?date=today",
      });
      sent.general += g.sent;
      anySpecific = true;
    }
  }

  /**
   * Vol retiré : état précédent (DB) vs actuel (sheet).
   * Pour chaque ligne où un membre d’équipe était assigné : si la ligne disparaît
   * ou n’est plus assignée à cette personne → notification.
   */
  for (const dateKey of dateKeys) {
    const prevMap = prev.byDate?.[dateKey] ?? {};
    const nextMap = byDate[dateKey] ?? {};

    for (const stableKey of Object.keys(prevMap)) {
      const prevRaw = (prevMap[stableKey] ?? "").trim();
      const prevLabel = labelFromSheetRaw(prevRaw);
      if (!prevLabel) continue;

      const nextExists = stableKey in nextMap;
      const nextRaw = nextExists ? (nextMap[stableKey] ?? "").trim() : "";
      const nextLabel = nextRaw !== "" ? labelFromSheetRaw(nextRaw) : null;
      const stillSame =
        nextExists && nextLabel !== null && nextLabel === prevLabel;
      if (stillSame) continue;

      logChangeDetected(prevLabel, "vol-retire", {
        dateService: dateKey,
        stableKey: stableKey.slice(0, 80),
        nextExists,
      });

      const r = await notifyPlanningAssigneeSubscribers(prevLabel, {
        title: volRetireTitle(dateKey),
        body: "Un service vous a été retiré. Vérifiez votre planning.",
      });
      if (r.sent === 0) {
        console.warn(
          `${LOG_PREFIX} vol-retire : 0 push pour "${prevLabel}" — vérifier user_name dans push_subscriptions`
        );
      }
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

      logChangeDetected(target, "planning-assignation", {
        dateService: dateKey,
        stableKey: stableKey.slice(0, 80),
      });

      const r = await notifyPlanningAssigneeSubscribers(target, {
        title: assigneePushTitle(dateKey),
        body: (() => {
          const snap = prev as SnapshotV5;
          const s = rowSummaries?.[dateKey]?.[stableKey] ?? snap.rowSummaries?.[dateKey]?.[stableKey];
          if (!s) return "👤 Tu as été assigné à un service. Vérifie ton planning.";
          const client = (s.client || "—").trim() || "—";
          const vol = (s.vol || "—").trim() || "—";
          const rdv = (s.rdv1 || s.rdv2 || "").trim();
          const p = prefixIfTomorrow(dateKey);
          return rdv
            ? `📅 ${p}Tu as été assigné au service ${client} - ${vol} (${rdv})`
            : `📅 ${p}Tu as été assigné au service ${client} - ${vol}`;
        })(),
        openUrl:
          dayBucketIso(dateKey) === "today"
            ? "/planning?date=today"
            : dayBucketIso(dateKey) === "tomorrow"
              ? "/planning?date=tomorrow"
              : `/planning?date=${encodeURIComponent(dateKey)}`,
      });
      if (r.sent === 0) {
        console.warn(
          `${LOG_PREFIX} assignation : 0 push pour "${target}" — vérifier user_name dans push_subscriptions`
        );
      }
      sent.assignee += r.sent;
      anySpecific = true;
    }
  }

  for (const row of rows) {
    if (normalizeCanonicalDateKey(row.dateIso) !== todayY) continue;
    const sk = stableServiceRowKey(row);
    const nextRaw = row.sheetAssignee.trim();
    const prevRaw = (prev.byDate?.[todayY]?.[sk] ?? "").trim();
    if (!sheetRowAlarmCandidateRaw(nextRaw)) continue;
    if (sheetRowAlarmCandidateRaw(prevRaw)) continue;

    const id = serviceUrgencyIdentityKey(row);
    const allowed = await canSendAlarmToday(spreadsheetId, id);
    if (!allowed) {
      console.log(`${LOG_PREFIX} alarme déjà envoyée aujourd’hui pour service`, id.slice(0, 60));
      continue;
    }

    logChangeDetected(id.slice(0, 48), "alarme-service-non-assigne", {
      dateService: row.dateIso,
    });

    const push = await broadcastAlarmUncoveredPush();
    if (push.sent === 0) {
      console.warn(
        `${LOG_PREFIX} alarme : 0 push — VAPID ou aucun abonné (voir logs planning-alarm-uncovered)`
      );
    }
    sent.alarm += push.sent;
    anySpecific = true;
    await markAlarmSentToday(spreadsheetId, id);
  }

  /** Rappels automatiques (aujourd’hui uniquement) : services avec emoji 🚨. */
  {
    const admin = getSupabaseAdmin();
    if (admin) {
      const now = DateTime.now().setZone(ZONE);
      for (const row of rows) {
        if (normalizeCanonicalDateKey(row.dateIso) !== todayY) continue;
        if (!hasAlarmEmoji(row)) continue;

        const rdvDt = parseRdvToDateTime(row.dateIso, row.rdv1);
        if (!rdvDt) continue;

        const kind = normalizeServiceType(row.type);
        const leadMin = kind === "departure" ? 30 : 60;
        const trigger = rdvDt.minus({ minutes: leadMin });
        const deltaMs = now.toMillis() - trigger.toMillis();
        if (deltaMs < 0 || deltaMs > REMINDER_WINDOW_MS) continue;

        const identityKey = serviceUrgencyIdentityKey(row);
        const reminderKind = `rdv1_${kind}_${leadMin}m`;
        const allowed = await canSendReminderToday(
          spreadsheetId,
          identityKey,
          reminderKind
        );
        if (!allowed) continue;

        const client = row.client.trim() || "—";
        const rdv = row.rdv1.trim() || "—";
        const t =
          kind === "departure"
            ? "DÉPART"
            : kind === "transit"
              ? "TRANSIT"
              : "ARRIVÉE";

        logChangeDetected(identityKey.slice(0, 48), "rappel-rdv1", {
          type: t,
          leadMin,
          rdv,
        });

        const push = await broadcastPlanningUpdate({
          title: "⏰ RAPPEL",
          body: `⏰ RAPPEL : ${t} ${client} - RDV à ${rdv} !`,
          openUrl: "/planning?date=today",
        });
        sent.general += push.sent;
        anySpecific = true;
        await markReminderSentToday(spreadsheetId, identityKey, reminderKind);
      }
    }
  }

  /** Modification de service : ciblée sur l’agent assigné (hors changement d’assignation) pour aujourd’hui / demain. */
  for (const dateKey of dateKeys) {
    if (dateKey !== todayY && dateKey !== tomorrowY) continue;
    const prevHashes = (prev.rowHashes?.[dateKey] ?? {}) as Record<string, string>;
    const nextHashes = (rowHashes?.[dateKey] ?? {}) as Record<string, string>;
    const prevMap = prev.byDate?.[dateKey] ?? {};
    const nextMap = byDate[dateKey] ?? {};
    const prevSumm =
      (prev as SnapshotV5).rowSummaries?.[dateKey] ?? {};
    const nextSumm = rowSummaries?.[dateKey] ?? {};

    for (const stableKey of Object.keys(nextHashes)) {
      if (!(stableKey in prevHashes)) continue; // nouveau service déjà traité
      const prevHash = prevHashes[stableKey];
      const nextHash = nextHashes[stableKey];
      if (prevHash === nextHash) continue;

      const prevAssRaw = (prevMap[stableKey] ?? "").trim();
      const nextAssRaw = (nextMap[stableKey] ?? "").trim();
      const prevAss = labelFromSheetRaw(prevAssRaw);
      const nextAss = labelFromSheetRaw(nextAssRaw);

      // Changement d'assignation : déjà géré ailleurs (push assignee) + message dédié.
      if (prevAss !== nextAss) continue;
      if (!nextAss) continue;

      const a = prevSumm[stableKey] as RowSummaryV1 | undefined;
      const b = nextSumm[stableKey] as RowSummaryV1 | undefined;
      if (!a || !b) continue;

      const client = (b.client || "—").trim() || "—";
      const vol = (b.vol || "—").trim() || "—";
      const rdvNew = (b.rdv1 || b.rdv2 || "—").trim() || "—";

      let body = "";
      if ((a.rdv1 || a.rdv2) !== (b.rdv1 || b.rdv2)) {
        const oldH = (a.rdv1 || a.rdv2 || "—").trim() || "—";
        const newH = (b.rdv1 || b.rdv2 || "—").trim() || "—";
        body = `🕒 ${prefixIfTomorrow(dateKey)}Horaire modifié pour ${client} : ${oldH} ➡️ ${newH}`;
      } else if (a.vol !== b.vol) {
        body = `✈️ ${prefixIfTomorrow(dateKey)}Vol modifié pour ${client} : ${(a.vol || "—").trim() || "—"} ➡️ ${vol}`;
      } else if (a.driverInfo !== b.driverInfo) {
        body = `📝 ${prefixIfTomorrow(dateKey)}Infos modifiées pour ${client} (${vol})`;
      } else if (a.destProv !== b.destProv) {
        body = `📍 ${prefixIfTomorrow(dateKey)}Dest/Prov modifiée pour ${client} : ${(a.destProv || "—").trim() || "—"} ➡️ ${(b.destProv || "—").trim() || "—"}`;
      } else if (a.type !== b.type) {
        body = `🧾 ${prefixIfTomorrow(dateKey)}Type modifié pour ${client} : ${(a.type || "—").trim() || "—"} ➡️ ${(b.type || "—").trim() || "—"}`;
      } else {
        body = `🛠️ ${prefixIfTomorrow(dateKey)}Service modifié : ${client} - ${vol}`;
      }

      logChangeDetected(nextAss, "planning-service-modifie", {
        dateService: dateKey,
        stableKey: stableKey.slice(0, 80),
      });

      // Interdit : pas de notif générique. On met en queue et on envoie après 5s d'inactivité.
      const title = client !== "—" ? client : vol;
      const openUrl =
        dayBucketIso(dateKey) === "today"
          ? "/planning?date=today"
          : dayBucketIso(dateKey) === "tomorrow"
            ? "/planning?date=tomorrow"
            : `/planning?date=${encodeURIComponent(dateKey)}`;

      await upsertPendingNotification(admin, {
        spreadsheet_id: spreadsheetId,
        date_key: dateKey,
        stable_row_key: stableKey,
        kind: "service_modified",
        target_name: nextAss,
        title,
        body,
        open_url: openUrl,
        last_hash: nextHash,
      });
      anySpecific = true;
    }
  }

  // Flush debounce queue (descriptif, ciblé) : envoi après 5s d'inactivité.
  sent.assignee += await flushDuePendingNotifications(admin, spreadsheetId);

  if (!anySpecific) {
    logChangeDetected("tous les abonnés", "planning-general", {
      motif: "hash différent mais aucun changement ciblé membre / alarme",
    });
    // Interdit : le message générique “Le planning a été modifié” ne doit plus exister.
  } else {
    console.log(`${LOG_PREFIX} notifications ciblées envoyées — pas de fallback général`, sent);
  }

  await persistPlanningState(
    admin,
    spreadsheetId,
    nextSnap,
    "apres-diff-notifications"
  );

  return {
    ok: true,
    globalHashChanged: true,
    sent,
  };
}
