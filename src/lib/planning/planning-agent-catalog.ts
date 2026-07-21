import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import {
  assignableAgents,
  authAgents,
  displayAgents,
  isPlanningAssignmentOnlySlug,
  isPlanningInternalAgentSlug,
  isPlanningTechnicalAdminSlug,
  normKey,
  PLANNING_ASSIGNEE_OPTIONS,
  planningDisplayNameEquals,
  type PlanningAgentOption,
} from "@/lib/planning/planning-team";

export type AgentsAuthRow = {
  name: string;
  role?: string | null;
  can_login?: boolean | null;
  is_active?: boolean | null;
  password?: string | null;
};

export type ManagedAgentRow = {
  name: string;
  slug: string;
  role: "admin" | "agent";
  canLogin: boolean;
  isActive: boolean;
  hasPassword: boolean;
  isProtected: boolean;
};

export type PlanningAgentCatalogPayload = {
  operationalLabels: string[];
  filterBarLabels: string[];
  assignableOptions: PlanningAgentOption[];
  authOptions: PlanningAgentOption[];
};

const PROTECTED_SUPER_ADMIN_NAMES = ["Javed", "JAVED ORDI", "Thomas"] as const;

export function isProtectedSuperAdminAgentName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return PROTECTED_SUPER_ADMIN_NAMES.some((n) => planningDisplayNameEquals(n, t));
}

function normalizeRole(raw: string | null | undefined): "admin" | "agent" {
  return raw?.trim().toLowerCase() === "admin" ? "admin" : "agent";
}

function optionFromName(name: string): PlanningAgentOption {
  const label = name.trim();
  const staticOpt = PLANNING_ASSIGNEE_OPTIONS.find((o) =>
    planningDisplayNameEquals(o.label, label)
  );
  if (staticOpt) return staticOpt;
  return {
    value: agentNameToSlug(label) as PlanningAgentOption["value"],
    label,
  };
}

function isRowActive(row: AgentsAuthRow): boolean {
  return row.is_active !== false;
}

export function buildManagedAgentRows(rows: AgentsAuthRow[]): ManagedAgentRow[] {
  const seen = new Set<string>();
  const out: ManagedAgentRow[] = [];

  for (const row of rows) {
    const name = row.name?.trim() ?? "";
    if (!name) continue;
    const key = normKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const opt = optionFromName(name);
    const role = normalizeRole(row.role);

    out.push({
      name,
      slug: opt.value,
      role,
      canLogin: row.can_login !== false,
      isActive: isRowActive(row),
      hasPassword:
        typeof row.password === "string" && row.password.trim().length > 0,
      isProtected: isProtectedSuperAdminAgentName(name),
    });
  }

  return out.sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
  );
}

export function buildPlanningAgentCatalog(
  rows: AgentsAuthRow[]
): PlanningAgentCatalogPayload {
  const inactiveNames = new Set(
    rows
      .filter((row) => row.is_active === false)
      .map((row) => normKey(String(row.name ?? "").trim()))
      .filter(Boolean)
  );
  const activeRows = rows.filter((row) => row.is_active !== false);
  const activeNames = new Set(
    activeRows.map((r) => normKey(r.name?.trim() ?? "")).filter(Boolean)
  );

  const assignableOptions: PlanningAgentOption[] = [];
  const seenAssignable = new Set<string>();
  for (const opt of assignableAgents()) {
    if (inactiveNames.has(normKey(opt.label))) continue;
    if (seenAssignable.has(opt.value)) continue;
    seenAssignable.add(opt.value);
    assignableOptions.push(opt);
  }
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name) continue;
    const opt = optionFromName(name);
    if (seenAssignable.has(opt.value)) continue;
    if (isPlanningTechnicalAdminSlug(opt.value)) continue;
    if (row.can_login === false && !isPlanningAssignmentOnlySlug(opt.value)) {
      continue;
    }
    seenAssignable.add(opt.value);
    assignableOptions.push(opt);
  }

  const operationalLabels: string[] = [];
  const seenOperational = new Set<string>();
  for (const opt of displayAgents()) {
    if (inactiveNames.has(normKey(opt.label))) continue;
    seenOperational.add(normKey(opt.label));
    operationalLabels.push(opt.label);
  }
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name || row.can_login === false) continue;
    const slug = optionFromName(name).value;
    if (
      !isPlanningInternalAgentSlug(slug) ||
      isPlanningTechnicalAdminSlug(slug) ||
      seenOperational.has(normKey(name))
    ) {
      continue;
    }
    seenOperational.add(normKey(name));
    operationalLabels.push(name);
  }
  operationalLabels.sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" })
  );

  const filterStatic = [
    "Javed",
    "Thomas",
    "Simon",
    "Karthik",
    "Elias",
    "Pravin",
    "Deva",
    "Kumar",
    "Rayane",
    "Moubine",
    "AIDA",
    "YAYA",
    "ESCALE",
    "AUTRE",
  ] as const;

  const filterBarLabels: string[] = [];
  const seenFilter = new Set<string>();
  for (const label of filterStatic) {
    if (inactiveNames.has(normKey(label))) continue;
    seenFilter.add(normKey(label));
    filterBarLabels.push(label);
  }
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name || row.can_login === false) continue;
    const slug = optionFromName(name).value;
    if (
      !isPlanningInternalAgentSlug(slug) ||
      isPlanningTechnicalAdminSlug(slug) ||
      seenFilter.has(normKey(name))
    ) {
      continue;
    }
    seenFilter.add(normKey(name));
    filterBarLabels.push(name);
  }

  const authOptions: PlanningAgentOption[] = [];
  const seenAuth = new Set<string>();
  for (const opt of authAgents()) {
    if (inactiveNames.has(normKey(opt.label))) continue;
    seenAuth.add(opt.value);
    authOptions.push(opt);
  }
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name || row.can_login === false) continue;
    const opt = optionFromName(name);
    if (seenAuth.has(opt.value)) continue;
    if (isPlanningAssignmentOnlySlug(opt.value)) continue;
    seenAuth.add(opt.value);
    authOptions.push(opt);
  }

  return {
    operationalLabels,
    filterBarLabels,
    assignableOptions,
    authOptions,
  };
}
