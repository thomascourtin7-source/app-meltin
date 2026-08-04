export type AgentAuthRole = "admin" | "agent";

export function normalizeAgentRole(raw: unknown): AgentAuthRole {
  return String(raw ?? "")
    .trim()
    .toLowerCase() === "admin"
    ? "admin"
    : "agent";
}

export function isAgentAdminRole(raw: unknown): boolean {
  return normalizeAgentRole(raw) === "admin";
}
