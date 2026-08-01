const ASSIGNEE_SEPARATOR = /[;,]/;

/** Parse `Simon;Rayane` or `Simon, Rayane` into individual agent display names. */
export function parseAssignedAgentNames(
  raw: string | null | undefined
): string[] {
  const name = String(raw ?? "").trim();
  if (!name) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of name.split(ASSIGNEE_SEPARATOR)) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "🚨" || /^n\/a$/i.test(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Format all assignees for D.O. display: `Simon & Rayane`. */
export function formatAssignedAgentNames(
  raw: string | null | undefined
): string | null {
  const names = parseAssignedAgentNames(raw);
  if (names.length === 0) return null;
  return names.join(" & ");
}

export function assignedAgentCountFromFormatted(
  formatted: string | null | undefined
): number {
  if (!formatted?.trim()) return 0;
  return formatted.split(" & ").filter(Boolean).length;
}

export function greeterCardTitle(agentCount: number): string {
  return agentCount > 1 ? "Your Greeters" : "Your Greeter";
}

export function assignedTimelineTitle(formattedNames: string): string {
  const count = assignedAgentCountFromFormatted(formattedNames);
  return count > 1
    ? `Greeters assigned: ${formattedNames}`
    : `Greeter assigned: ${formattedNames}`;
}

/** Prefer planning assignment, else report assignee. */
export function resolveTrackAgentNames(
  assignmentRaw: string | null | undefined,
  reportRaw: string | null | undefined
): string | null {
  const fromAssign = parseAssignedAgentNames(assignmentRaw);
  const fromReport = parseAssignedAgentNames(reportRaw);
  const source = fromAssign.length > 0 ? fromAssign : fromReport;
  if (source.length === 0) return null;
  return source.join(" & ");
}

/** Split formatted display string back into individual names. */
export function parseFormattedAgentNames(
  formatted: string | null | undefined
): string[] {
  if (!formatted?.trim()) return [];
  return formatted
    .split(" & ")
    .map((n) => n.trim())
    .filter(Boolean);
}
