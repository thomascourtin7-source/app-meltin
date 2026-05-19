/** Valeurs stables persistées dans `service_reports.bags_status`. */
export const BAGS_STATUS_VALUES = [
  "checked_through",
  "no_bags",
  "collect_paris_recheck",
] as const;

export type BagsStatusValue = (typeof BAGS_STATUS_VALUES)[number];

export const TRANSIT_BAGS_STATUS_OPTIONS: ReadonlyArray<{
  value: BagsStatusValue;
  label: string;
}> = [
  {
    value: "checked_through",
    label: "Checked through (Enregistré jusqu'à destination)",
  },
  {
    value: "no_bags",
    label: "No bags (Pas de bagages)",
  },
  {
    value: "collect_paris_recheck",
    label: "Collect in Paris & re-check (Récupérer à Paris & ré-enregistrer)",
  },
];

export function isValidBagsStatus(value: string): value is BagsStatusValue {
  return (BAGS_STATUS_VALUES as readonly string[]).includes(value);
}

export function bagsStatusDisplayLabel(
  value: string | null | undefined
): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const opt = TRANSIT_BAGS_STATUS_OPTIONS.find((o) => o.value === v);
  return opt?.label ?? v;
}

/** Lit `bags_status` ou l’ancienne colonne `transit_bags` si présente. */
export function readBagsStatusFromReport(row: {
  bags_status?: string | null;
  transit_bags?: string | null;
}): string {
  const primary = (row.bags_status ?? "").trim();
  if (primary && isValidBagsStatus(primary)) return primary;
  const legacy = (row.transit_bags ?? "").trim();
  if (legacy && isValidBagsStatus(legacy)) return legacy;
  return "";
}
