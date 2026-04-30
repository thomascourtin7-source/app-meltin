import type { DailyServiceRow } from "@/lib/planning/daily-services-types";
import { getBusyIntervalForRow, type MinuteInterval } from "@/lib/planning/time-conflicts";

export type ShiftValue = "morning" | "evening" | "full";

export type AgentShift = {
  label: string; // ex. "Thomas"
  slug: string; // ex. "thomas"
  shift: ShiftValue;
};

export type IAScheduleResult = {
  /** stableServiceRowKey(row) -> assignee slug */
  assignmentsByRowKey: Record<string, string>;
  /** diagnostics utiles */
  unassignedRowKeys: string[];
};

const TRAVEL_BUFFER_MIN = 15 as const;

type Window = { start: number; end: number }; // minutes [start, end]

function shiftToWindow(shift: ShiftValue): Window {
  // Matin (05h-14h), Soir (12h-23h)
  if (shift === "morning") return { start: 5 * 60, end: 14 * 60 };
  if (shift === "evening") return { start: 12 * 60, end: 23 * 60 };
  return { start: 5 * 60, end: 23 * 60 };
}

function clampInterval(iv: MinuteInterval): MinuteInterval {
  return {
    start: Math.max(0, Math.min(24 * 60, iv.start)),
    end: Math.max(0, Math.min(24 * 60, iv.end)),
  };
}

function sortKey(iv: MinuteInterval | null, fallbackIndex: number): number {
  if (!iv) return 10_000_000 + fallbackIndex;
  return iv.start;
}

type RowItem = {
  row: DailyServiceRow;
  rowKey: string;
  interval: MinuteInterval | null;
  index: number;
};

type AgentState = {
  slug: string;
  label: string;
  window: Window;
  nextAvailableAt: number;
  loadMinutes: number;
};

export function generateIASchedule(opts: {
  rows: DailyServiceRow[];
  rowKeyForRow: (row: DailyServiceRow) => string;
  agents: AgentShift[];
}): IAScheduleResult {
  const items: RowItem[] = opts.rows.map((row, i) => {
    const raw = getBusyIntervalForRow(row);
    const interval = raw ? clampInterval(raw) : null;
    return { row, rowKey: opts.rowKeyForRow(row), interval, index: i };
  });

  items.sort(
    (a, b) => sortKey(a.interval, a.index) - sortKey(b.interval, b.index)
  );

  const agents: AgentState[] = opts.agents.map((a) => {
    const w = shiftToWindow(a.shift);
    return {
      slug: a.slug,
      label: a.label,
      window: w,
      nextAvailableAt: w.start,
      loadMinutes: 0,
    };
  });

  const assignmentsByRowKey: Record<string, string> = {};
  const unassignedRowKeys: string[] = [];

  for (const item of items) {
    const iv = item.interval;

    // Services sans heure exploitable -> attribuer au moins chargé (dans son shift)
    if (!iv) {
      const candidate = agents
        .slice()
        .sort((a, b) => a.loadMinutes - b.loadMinutes)[0];
      if (!candidate) {
        unassignedRowKeys.push(item.rowKey);
      } else {
        assignmentsByRowKey[item.rowKey] = candidate.slug;
        candidate.loadMinutes += 10; // petite pénalité arbitraire
      }
      continue;
    }

    const serviceStart = iv.start;
    const serviceEnd = iv.end;
    const serviceEndWithBuffer = serviceEnd + TRAVEL_BUFFER_MIN;
    const duration = Math.max(0, serviceEnd - serviceStart);

    const candidates = agents.filter((a) => {
      const withinShift =
        serviceStart >= a.window.start && serviceEndWithBuffer <= a.window.end;
      const free = a.nextAvailableAt <= serviceStart;
      return withinShift && free;
    });

    let chosen: AgentState | null = null;
    if (candidates.length > 0) {
      chosen = candidates
        .slice()
        .sort((a, b) => a.loadMinutes - b.loadMinutes)[0]!;
    } else {
      // Aucun agent parfaitement libre à l'instant T (ou shift strict). Fallback:
      // prendre l'agent dont le shift accepte le service et qui a le moins de charge,
      // même s'il a un chevauchement (on préfère rester dans le shift).
      const shiftCandidates = agents.filter(
        (a) =>
          serviceStart >= a.window.start && serviceEndWithBuffer <= a.window.end
      );
      if (shiftCandidates.length > 0) {
        chosen = shiftCandidates
          .slice()
          .sort((a, b) => a.loadMinutes - b.loadMinutes)[0]!;
      }
    }

    if (!chosen) {
      unassignedRowKeys.push(item.rowKey);
      continue;
    }

    assignmentsByRowKey[item.rowKey] = chosen.slug;
    chosen.loadMinutes += duration + TRAVEL_BUFFER_MIN;
    chosen.nextAvailableAt = Math.max(chosen.nextAvailableAt, serviceEndWithBuffer);
  }

  return { assignmentsByRowKey, unassignedRowKeys };
}

