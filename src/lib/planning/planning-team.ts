/**
 * Urgence : valeur technique stable (localStorage, logique, comparaisons).
 * L’affichage utilise toujours {@link assigneeDisplayLabel}.
 */
export const PLANNING_URGENT_ASSIGNEE_SLUG = "emoji_alert" as const;

/** Texte affiché pour l’urgence (sirènes). */
export const PLANNING_URGENT_ASSIGNEE_DISPLAY = "🚨🚨🚨" as const;

/** @deprecated Utiliser {@link PLANNING_URGENT_ASSIGNEE_SLUG} — alias pour le code existant. */
export const PLANNING_URGENT_ASSIGNEE_VALUE = PLANNING_URGENT_ASSIGNEE_SLUG;

/**
 * Membres affichables (sélecteur planning + feuille Google « assigné »).
 * `value` = clé technique ; `label` = texte affiché (🚨 pour l’urgence).
 */
export const PLANNING_ASSIGNEE_OPTIONS = [
  { value: "__none__", label: "Non assigné" },
  { value: "javed", label: "Javed" },
  { value: "javed_ordo", label: "JAVED ORDI" },
  { value: "thomas", label: "Thomas" },
  { value: "test", label: "Test" },
  { value: "simon", label: "Simon" },
  { value: "karthik", label: "Karthik" },
  { value: "elias", label: "Elias" },
  { value: "pravin", label: "Pravin" },
  { value: "deva", label: "Deva" },
  { value: "kumar", label: "Kumar" },
  { value: "rayane", label: "Rayane" },
  { value: "moubine", label: "Moubine" },
  { value: "aida", label: "AIDA" },
  { value: "yaya", label: "YAYA" },
  { value: "escale", label: "ESCALE" },
  { value: "autre", label: "AUTRE" },
  {
    value: PLANNING_URGENT_ASSIGNEE_SLUG,
    label: PLANNING_URGENT_ASSIGNEE_DISPLAY,
  },
] as const;

/**
 * Agents internes opérationnels : badge en barre du haut, filtre « Me »,
 * connexion. ⚠️ N'implique PAS le rôle admin : l'autorité admin est définie
 * uniquement par {@link ADMINS} (cf. `planning-admins.ts`). Ex. « rayane » est
 * un agent interne STANDARD (non-admin).
 */
export const PLANNING_INTERNAL_AGENT_SLUGS = [
  "pravin",
  "deva",
  "kumar",
  "thomas",
  "simon",
  "karthik",
  "javed",
  "elias",
  "rayane",
  "moubine",
] as const;

/** Comptes admin techniques (connexion OK, jamais assignés ni badge opérationnel). */
export const PLANNING_TECHNICAL_ADMIN_SLUGS = ["javed_ordo"] as const;

/** Entités assignables au planning sans compte de connexion. */
export const PLANNING_ASSIGNMENT_ONLY_SLUGS = [
  "aida",
  "yaya",
  "escale",
  "autre",
] as const;

export function isPlanningAssignmentOnlySlug(slug: string): boolean {
  return (PLANNING_ASSIGNMENT_ONLY_SLUGS as readonly string[]).includes(slug);
}

export function isPlanningInternalAgentSlug(slug: string): boolean {
  return (PLANNING_INTERNAL_AGENT_SLUGS as readonly string[]).includes(slug);
}

export function isPlanningTechnicalAdminSlug(slug: string): boolean {
  return (PLANNING_TECHNICAL_ADMIN_SLUGS as readonly string[]).includes(slug);
}

/** Agents opérationnels (badges couleur, filtre « Me »). */
export function isPlanningOperationalAgentSlug(slug: string): boolean {
  return isPlanningInternalAgentSlug(slug) && !isPlanningTechnicalAdminSlug(slug);
}

export type PlanningAssigneeSlug = (typeof PLANNING_ASSIGNEE_OPTIONS)[number]["value"];

export const DEFAULT_PLANNING_ASSIGNEE_SLUG: PlanningAssigneeSlug = "__none__";

/** Nombre maximum d’assignés distincts par ligne de service (UI + localStorage). */
export const MAX_PLANNING_ASSIGNEES_PER_SERVICE = 4 as const;

export const KNOWN_PLANNING_ASSIGNEE_SLUGS: string[] =
  PLANNING_ASSIGNEE_OPTIONS.map((o) => o.value);

/** Noms proposés dans « S'enregistrer » (push ciblé = libellé enregistré côté serveur). */
export const PLANNING_TEAM_REGISTER_OPTIONS = PLANNING_ASSIGNEE_OPTIONS.filter(
  (o) =>
    o.value !== "__none__" &&
    o.value !== PLANNING_URGENT_ASSIGNEE_SLUG &&
    !isPlanningAssignmentOnlySlug(o.value) &&
    !isPlanningTechnicalAdminSlug(o.value)
);

/**
 * Texte à afficher pour une valeur d’assignation : toujours le `label` de
 * {@link PLANNING_ASSIGNEE_OPTIONS} (jamais le slug `emoji_alert` à l’écran).
 */
export function assigneeDisplayLabel(stored: string): string {
  if (
    stored === PLANNING_URGENT_ASSIGNEE_SLUG ||
    stored === PLANNING_URGENT_ASSIGNEE_DISPLAY
  ) {
    return PLANNING_URGENT_ASSIGNEE_DISPLAY;
  }
  const opt = PLANNING_ASSIGNEE_OPTIONS.find((o) => o.value === stored);
  return opt?.label ?? stored;
}

/**
 * Normalise une valeur lue depuis le localStorage (anciennes données en emoji pur incluses).
 */
export function normalizeAssigneeStoredValue(
  value: string | undefined
): string {
  if (value === undefined || value === "") return DEFAULT_PLANNING_ASSIGNEE_SLUG;
  if (value === PLANNING_URGENT_ASSIGNEE_DISPLAY) {
    return PLANNING_URGENT_ASSIGNEE_SLUG;
  }
  if (value === PLANNING_URGENT_ASSIGNEE_SLUG) return PLANNING_URGENT_ASSIGNEE_SLUG;
  if (KNOWN_PLANNING_ASSIGNEE_SLUGS.includes(value)) return value;
  return DEFAULT_PLANNING_ASSIGNEE_SLUG;
}

/**
 * Normalise une assignation persistée : ancienne chaîne unique ou tableau (v3).
 * Toujours au moins un créneau ; au plus {@link MAX_PLANNING_ASSIGNEES_PER_SERVICE}.
 */
export function normalizeAssigneeListFromStored(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [DEFAULT_PLANNING_ASSIGNEE_SLUG];
  }
  if (typeof raw === "string") {
    return [normalizeAssigneeStoredValue(raw)];
  }
  if (Array.isArray(raw)) {
    const slots = raw
      .slice(0, MAX_PLANNING_ASSIGNEES_PER_SERVICE)
      .map((x) =>
        normalizeAssigneeStoredValue(typeof x === "string" ? x : undefined)
      );
    return slots.length > 0 ? slots : [DEFAULT_PLANNING_ASSIGNEE_SLUG];
  }
  return [DEFAULT_PLANNING_ASSIGNEE_SLUG];
}

export function isUrgentAssignee(stored: string): boolean {
  return (
    stored === PLANNING_URGENT_ASSIGNEE_SLUG ||
    stored === PLANNING_URGENT_ASSIGNEE_DISPLAY
  );
}

export type PlanningAgentOption = {
  value: PlanningAssigneeSlug;
  label: string;
};

/** 8 agents internes opérationnels — badges navigation en haut de page. */
export function displayAgents(): PlanningAgentOption[] {
  return PLANNING_ASSIGNEE_OPTIONS.filter((o) =>
    isPlanningOperationalAgentSlug(o.value)
  );
}

/**
 * Menu d’assignation des services : agents internes + sous-traitants (+ non assigné, urgence).
 * Exclut les comptes admin techniques (ex. JAVED ORDI).
 */
export function assignableAgents(): PlanningAgentOption[] {
  return PLANNING_ASSIGNEE_OPTIONS.filter((o) => {
    if (isPlanningTechnicalAdminSlug(o.value)) return false;
    return (
      o.value === DEFAULT_PLANNING_ASSIGNEE_SLUG ||
      isUrgentAssignee(o.value) ||
      isPlanningOperationalAgentSlug(o.value) ||
      isPlanningAssignmentOnlySlug(o.value)
    );
  });
}

/** Comptes avec connexion (page login / premier accès). Inclut JAVED ORDI. */
export function authAgents(): PlanningAgentOption[] {
  return PLANNING_ASSIGNEE_OPTIONS.filter(
    (o) =>
      o.value !== DEFAULT_PLANNING_ASSIGNEE_SLUG &&
      !isUrgentAssignee(o.value) &&
      !isPlanningAssignmentOnlySlug(o.value)
  );
}

export function isPlanningAuthAgentSlug(slug: string): boolean {
  return authAgents().some((o) => o.value === slug);
}

/** @deprecated Utiliser {@link displayAgents}. */
export const planningBadgeAgentOptions = displayAgents;

/** @deprecated Utiliser {@link assignableAgents}. */
export const planningAssignableOptions = assignableAgents;

export function isPlanningSelectableAssigneeValue(value: string): boolean {
  if (value === DEFAULT_PLANNING_ASSIGNEE_SLUG || isUrgentAssignee(value)) {
    return true;
  }
  if (isPlanningTechnicalAdminSlug(value)) return false;
  return (
    isPlanningOperationalAgentSlug(value) || isPlanningAssignmentOnlySlug(value)
  );
}

/**
 * Filtre « Mes accueils » : slug session agent opérationnel explicitement assigné.
 */
export function isServiceAssignedToSessionAgent(
  assigneesRaw: unknown,
  sessionSlug: string | null | undefined
): boolean {
  const slug = sessionSlug?.trim().toLowerCase() ?? "";
  if (!slug || !isPlanningOperationalAgentSlug(slug)) return false;
  const list = normalizeAssigneeListFromStored(assigneesRaw);
  return list.some((entry) => entry === slug);
}

/** Libellés affichés dans la barre de filtre agent (JAVED ORDI / test). */
export const PLANNING_AGENT_FILTER_BAR_LABELS = [
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

/** Filtre planning : service assigné à l’agent (libellé affiché). */
export function isServiceAssignedToAgentLabel(
  assigneesRaw: unknown,
  agentLabel: string
): boolean {
  return isServiceStrictlyAssignedToAgentLabel(assigneesRaw, agentLabel);
}

/** Slugs tels qu’affichés dans le sélecteur d’assignation (carte planning). */
export function effectiveCardAssigneeSlugs(raw: unknown): string[] {
  return normalizeAssigneeListFromStored(raw).map((slug) =>
    isPlanningSelectableAssigneeValue(slug)
      ? slug
      : DEFAULT_PLANNING_ASSIGNEE_SLUG
  );
}

/** Carte affichée « Non assigné » (aligné sur le Select de la carte). */
export function isCardUiUnassigned(raw: unknown): boolean {
  return !effectiveCardAssigneeSlugs(raw).some(
    (slug) => slug !== DEFAULT_PLANNING_ASSIGNEE_SLUG && !isUrgentAssignee(slug)
  );
}

/**
 * Filtre supervision (Javed) : l’agent ciblé doit être réellement assigné.
 * Exclut strictement non assigné (vide / __none__) et urgence 🚨 seule.
 */
export function isServiceStrictlyAssignedToAgentLabel(
  assigneesRaw: unknown,
  agentLabel: string
): boolean {
  const target = agentLabel.trim();
  if (!target) return false;
  if (isCardUiUnassigned(assigneesRaw)) return false;
  return effectiveCardAssigneeSlugs(assigneesRaw).some((slug) => {
    if (slug === DEFAULT_PLANNING_ASSIGNEE_SLUG || isUrgentAssignee(slug)) {
      return false;
    }
    const label = assigneeSlugToNotifyLabel(slug);
    return label != null && planningDisplayNameEquals(label, target);
  });
}

/**
 * Libellé pour notifications push (`user_name` en base) : même chaîne que le prénom chat.
 * Retourne null si non assigné ou urgence (pas de push nominatif).
 */
export function assigneeSlugToNotifyLabel(slug: string): string | null {
  if (
    slug === DEFAULT_PLANNING_ASSIGNEE_SLUG ||
    isUrgentAssignee(slug) ||
    isPlanningTechnicalAdminSlug(slug)
  ) {
    return null;
  }
  const opt = PLANNING_ASSIGNEE_OPTIONS.find((o) => o.value === slug);
  return opt?.label ?? slug;
}

export function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Compare deux libellés « humains » (profil, agent affiché). */
export function planningDisplayNameEquals(a: string, b: string): boolean {
  return normKey(a) === normKey(b);
}

/** Slug planning pour un libellé d’agent (ex. profil « S’enregistrer »). */
export function assigneeSlugFromNotifyLabel(label: string): string | null {
  const t = label.trim();
  if (!t) return null;
  const key = normKey(t);
  for (const o of PLANNING_ASSIGNEE_OPTIONS) {
    if (
      o.value === DEFAULT_PLANNING_ASSIGNEE_SLUG ||
      isUrgentAssignee(o.value) ||
      isPlanningTechnicalAdminSlug(o.value)
    ) {
      continue;
    }
    if (normKey(o.label) === key) return o.value;
  }
  return null;
}

/**
 * Associe le texte lu dans la colonne « assigné » du Sheet à un libellé d’équipe connu
 * (retourne le `label` exact, ex. « Simon », pour matcher `user_name` en base).
 */
export function matchSheetAssigneeToTeamLabel(raw: string): string | null {
  const key = normKey(raw);
  if (!key) return null;
  for (const o of assignableAgents()) {
    if (o.value === DEFAULT_PLANNING_ASSIGNEE_SLUG || isUrgentAssignee(o.value)) {
      continue;
    }
    if (normKey(o.label) === key || normKey(o.value) === key) {
      return o.label;
    }
  }
  return null;
}

/**
 * Decode `service_reports.assignee_name` into planning slugs.
 * We accept legacy free-text and also multi-assign formats like "Javed;Thomas".
 * Cellule vide / absente ⇒ `[]` (l’appelant applique ensuite `normalizeAssigneeListFromStored` pour l’UI).
 */
export function parseAssigneeNameToSlugs(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const t = String(raw).trim();
  if (!t) return [];
  if (t === PLANNING_URGENT_ASSIGNEE_DISPLAY) return [PLANNING_URGENT_ASSIGNEE_SLUG];
  if (t === PLANNING_URGENT_ASSIGNEE_SLUG) return [PLANNING_URGENT_ASSIGNEE_SLUG];

  const parts = t
    .split(/[;|,+/]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return [DEFAULT_PLANNING_ASSIGNEE_SLUG];

  const slugs: string[] = [];
  for (const p of parts) {
    if (p === PLANNING_URGENT_ASSIGNEE_DISPLAY) {
      slugs.push(PLANNING_URGENT_ASSIGNEE_SLUG);
      continue;
    }
    const s = assigneeSlugFromNotifyLabel(p);
    if (s) slugs.push(s);
  }
  return normalizeAssigneeListFromStored(slugs);
}

/**
 * Encode slugs into a stable, human-readable string for `service_reports.assignee_name`.
 * Uses team labels, separated by `;` (to allow multiple assignees).
 */
export function serializeAssigneeSlugsToName(slugs: string[]): string | null {
  const list = normalizeAssigneeListFromStored(slugs);
  const labels: string[] = [];
  for (const slug of list) {
    if (slug === DEFAULT_PLANNING_ASSIGNEE_SLUG) continue;
    if (slug === PLANNING_URGENT_ASSIGNEE_SLUG) {
      labels.push(PLANNING_URGENT_ASSIGNEE_DISPLAY);
      continue;
    }
    const label = assigneeSlugToNotifyLabel(slug);
    if (label) labels.push(label);
  }
  const out = labels.join(";");
  return out ? out : null;
}
