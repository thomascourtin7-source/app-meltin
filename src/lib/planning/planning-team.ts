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
  { value: "thomas", label: "Thomas" },
  { value: "simon", label: "Simon" },
  { value: "karthik", label: "Karthik" },
  { value: "elias", label: "Elias" },
  { value: "pravin", label: "Pravin" },
  { value: "deva", label: "Deva" },
  { value: "kumar", label: "Kumar" },
  { value: "subcontracted", label: "Sous-traité" },
  {
    value: PLANNING_URGENT_ASSIGNEE_SLUG,
    label: PLANNING_URGENT_ASSIGNEE_DISPLAY,
  },
] as const;

export type PlanningAssigneeSlug = (typeof PLANNING_ASSIGNEE_OPTIONS)[number]["value"];

export const DEFAULT_PLANNING_ASSIGNEE_SLUG: PlanningAssigneeSlug = "__none__";

/** Nombre maximum d’assignés distincts par ligne de service (UI + localStorage). */
export const MAX_PLANNING_ASSIGNEES_PER_SERVICE = 4 as const;

export const KNOWN_PLANNING_ASSIGNEE_SLUGS: string[] =
  PLANNING_ASSIGNEE_OPTIONS.map((o) => o.value);

/** Noms proposés dans « S'enregistrer » (push ciblé = libellé enregistré côté serveur). */
export const PLANNING_TEAM_REGISTER_OPTIONS = PLANNING_ASSIGNEE_OPTIONS.filter(
  (o) => o.value !== "__none__" && o.value !== PLANNING_URGENT_ASSIGNEE_SLUG
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

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Associe le texte lu dans la colonne « assigné » du Sheet à un libellé d’équipe connu
 * (retourne le `label` exact, ex. « Simon », pour matcher `user_name` en base).
 */
export function matchSheetAssigneeToTeamLabel(raw: string): string | null {
  const key = normKey(raw);
  if (!key) return null;
  for (const o of PLANNING_TEAM_REGISTER_OPTIONS) {
    if (normKey(o.label) === key || normKey(o.value) === key) {
      return o.label;
    }
  }
  return null;
}
