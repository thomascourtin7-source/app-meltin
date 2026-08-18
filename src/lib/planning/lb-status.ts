export type LbStatus = "large" | "block" | null;

export type ServiceLbStatusEntry = {
  status: LbStatus;
  updatedBy: string | null;
  updatedAt: string | null;
};

export function parseLbStatus(value: unknown): LbStatus {
  if (value === "large" || value === "block") return value;
  return null;
}

export function emptyLbStatusEntry(): ServiceLbStatusEntry {
  return { status: null, updatedBy: null, updatedAt: null };
}

export function lbStatusButtonLabel(status: LbStatus): string {
  if (status === "large") return "LARGE";
  if (status === "block") return "BLOCK";
  return "L or B";
}

/** Ex. « Karthik, aujourd'hui à 12:59 » ou « Karthik, hier à 12:59 ». */
export function formatLbStatusMeta(
  agentName: string | null | undefined,
  updatedAt: string | null | undefined
): string | null {
  const who = (agentName ?? "").trim();
  if (!who || !updatedAt) return null;

  const dt = new Date(updatedAt);
  if (Number.isNaN(dt.getTime())) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const dtDayStart = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());

  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);

  let dayPart: string;
  if (dtDayStart.getTime() === todayStart.getTime()) {
    dayPart = `aujourd'hui à ${time}`;
  } else if (dtDayStart.getTime() === yesterdayStart.getTime()) {
    dayPart = `hier à ${time}`;
  } else {
    dayPart = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt);
  }

  return `${who}, ${dayPart}`;
}
