export type ServiceAssignmentLogRow = {
  id: string;
  service_id: string;
  changed_by: string;
  old_agent: string | null;
  new_agent: string | null;
  created_at: string;
};

export function normalizeAssignmentLogAgentName(
  name: string | null | undefined
): string | null {
  const t = (name ?? "").trim();
  return t || null;
}

export function assignmentLogAgentNamesDiffer(
  before: string | null | undefined,
  after: string | null | undefined
): boolean {
  return (
    normalizeAssignmentLogAgentName(before) !==
    normalizeAssignmentLogAgentName(after)
  );
}

export function formatAssignmentLogAgentLabel(
  name: string | null | undefined
): string {
  return normalizeAssignmentLogAgentName(name) ?? "Non assigné";
}

export function formatAssignmentLogLine(log: ServiceAssignmentLogRow): string {
  const dt = new Date(log.created_at);
  const time = Number.isNaN(dt.getTime())
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(dt);
  const who = (log.changed_by ?? "").trim() || "—";
  const from = formatAssignmentLogAgentLabel(log.old_agent);
  const to = formatAssignmentLogAgentLabel(log.new_agent);
  return `${who} a changé l'assignation de ${from} à ${to} à ${time}`;
}
