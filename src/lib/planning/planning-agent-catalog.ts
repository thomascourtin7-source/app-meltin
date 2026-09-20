import { agentNameToSlug } from "@/lib/auth/agent-name-slug";
import {
  assignableAgents,
  authAgents,
  displayAgents,
  isPlanningAssignmentOnlySlug,
  isPlanningInternalAgentSlug,
  isPlanningTechnicalAdminSlug,
  KNOWN_PLANNING_ASSIGNEE_SLUGS,
  normKey,
  PLANNING_AGENT_FILTER_BAR_LABELS,
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
    value: agentNameToSlug(label),
    label,
  };
}

function isLegacyNonOperationalSlug(slug: string): boolean {
  return (
    KNOWN_PLANNING_ASSIGNEE_SLUGS.includes(slug) &&
    !isPlanningInternalAgentSlug(slug)
  );
}

function isRowActive(row: AgentsAuthRow): boolean {
  return row.is_active !== false;
}

const TEAM_INSERT_AFTER_LABEL = "Deva";

function insertAfterDeva<T>(
  list: T[],
  extras: T[],
  getLabel: (item: T) => string
): void {
  if (extras.length === 0) return;
  const idx = list.findIndex((item) =>
    planningDisplayNameEquals(getLabel(item), TEAM_INSERT_AFTER_LABEL)
  );
  const at = idx >= 0 ? idx + 1 : list.length;
  list.splice(at, 0, ...extras);
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
  const extraAssignableReal: PlanningAgentOption[] = [];
  const extraAssignableOther: PlanningAgentOption[] = [];
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
    if (
      isPlanningAssignmentOnlySlug(opt.value) ||
      isLegacyNonOperationalSlug(opt.value)
    ) {
      extraAssignableOther.push(opt);
    } else {
      extraAssignableReal.push(opt);
    }
  }
  insertAfterDeva(assignableOptions, extraAssignableReal, (o) => o.label);
  assignableOptions.push(...extraAssignableOther);

  const operationalLabels: string[] = [];
  const seenOperational = new Set<string>();
  for (const opt of displayAgents()) {
    if (inactiveNames.has(normKey(opt.label))) continue;
    seenOperational.add(normKey(opt.label));
    operationalLabels.push(opt.label);
  }
  const extraOperational: string[] = [];
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name || row.can_login === false) continue;
    const slug = optionFromName(name).value;
    if (
      isPlanningTechnicalAdminSlug(slug) ||
      isPlanningAssignmentOnlySlug(slug) ||
      isLegacyNonOperationalSlug(slug) ||
      seenOperational.has(normKey(name))
    ) {
      continue;
    }
    seenOperational.add(normKey(name));
    extraOperational.push(name);
  }
  insertAfterDeva(operationalLabels, extraOperational, (label) => label);

  const filterBarLabels: string[] = [];
  const seenFilter = new Set<string>();
  for (const label of PLANNING_AGENT_FILTER_BAR_LABELS) {
    if (inactiveNames.has(normKey(label))) continue;
    seenFilter.add(normKey(label));
    filterBarLabels.push(label);
  }
  const extraFilter: string[] = [];
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name || row.can_login === false) continue;
    const slug = optionFromName(name).value;
    if (
      isPlanningTechnicalAdminSlug(slug) ||
      isLegacyNonOperationalSlug(slug) ||
      seenFilter.has(normKey(name))
    ) {
      continue;
    }
    seenFilter.add(normKey(name));
    extraFilter.push(name);
  }
  insertAfterDeva(filterBarLabels, extraFilter, (label) => label);

  const authOptions: PlanningAgentOption[] = [];
  const seenAuth = new Set<string>();
  for (const opt of authAgents()) {
    if (inactiveNames.has(normKey(opt.label))) continue;
    seenAuth.add(opt.value);
    authOptions.push(opt);
  }
  const extraAuth: PlanningAgentOption[] = [];
  for (const row of activeRows) {
    const name = row.name?.trim() ?? "";
    if (!name || row.can_login === false) continue;
    const opt = optionFromName(name);
    if (seenAuth.has(opt.value)) continue;
    if (isPlanningAssignmentOnlySlug(opt.value)) continue;
    seenAuth.add(opt.value);
    extraAuth.push(opt);
  }
  insertAfterDeva(authOptions, extraAuth, (o) => o.label);

  return {
    operationalLabels,
    filterBarLabels,
    assignableOptions,
    authOptions,
  };
}
