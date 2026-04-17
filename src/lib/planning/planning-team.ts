/**
 * Membres affichables (sélecteur planning + feuille Google « assigné »).
 * La valeur `value` sert au localStorage des assignations UI ; `label` est le texte humain (et dans le Sheet).
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
  { value: "emoji_alert", label: "🚨🚨🚨" },
] as const;

export type PlanningAssigneeSlug = (typeof PLANNING_ASSIGNEE_OPTIONS)[number]["value"];

export const DEFAULT_PLANNING_ASSIGNEE_SLUG: PlanningAssigneeSlug = "__none__";

export const KNOWN_PLANNING_ASSIGNEE_SLUGS: string[] =
  PLANNING_ASSIGNEE_OPTIONS.map((o) => o.value);

/** Noms proposés dans « S'enregistrer » (push ciblé = libellé enregistré côté serveur). */
export const PLANNING_TEAM_REGISTER_OPTIONS = PLANNING_ASSIGNEE_OPTIONS.filter(
  (o) => o.value !== "__none__" && o.value !== "emoji_alert"
);

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
