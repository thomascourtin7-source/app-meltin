import { formatEscaleAssignmentNotice } from "@/lib/auth/planning-external";
import { storedAssigneeIncludesAgent } from "@/lib/planning/filter-planning-rows-for-agent";
import {
  PLANNING_EXTERNAL_AGENT_SLUGS,
  assigneeSlugToNotifyLabel,
} from "@/lib/planning/planning-team";
import { notifyPlanningAssigneeSubscribers } from "@/lib/push/notify-planning-assignee";

function firstRdvLabel(raw: string): string {
  const t = raw.trim();
  const m = /(\d{1,2})[:hH](\d{2})/.exec(t);
  if (!m) return t;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export async function notifyExternalAssigneeChange(opts: {
  oldAgent: string | null | undefined;
  newAgent: string | null | undefined;
  serviceId: string;
  serviceDate: string;
  vol?: string | null;
  rdv?: string | null;
}): Promise<void> {
  const vol = (opts.vol ?? "").trim();
  const rdv = firstRdvLabel(opts.rdv ?? "");
  const dateParam = opts.serviceDate.slice(0, 10);
  const openUrl = `/planning?date=${encodeURIComponent(dateParam)}${
    opts.serviceId ? `&serviceId=${encodeURIComponent(opts.serviceId)}` : ""
  }`;

  for (const slug of PLANNING_EXTERNAL_AGENT_SLUGS) {
    const label = assigneeSlugToNotifyLabel(slug) ?? slug;
    const wasAssigned = storedAssigneeIncludesAgent(opts.oldAgent, label);
    const isAssigned = storedAssigneeIncludesAgent(opts.newAgent, label);
    if (wasAssigned === isAssigned) continue;

    const kind = isAssigned && !wasAssigned ? "assigned" : "removed";
    const body = formatEscaleAssignmentNotice({ kind, vol, rdv });
    const title =
      kind === "assigned"
        ? "Nouveau service assigné"
        : "Service retiré";
    try {
      await notifyPlanningAssigneeSubscribers(label, {
        title,
        body,
        openUrl,
      });
    } catch (error) {
      console.warn("[notifyExternalAssigneeChange]", error);
    }
  }
}
