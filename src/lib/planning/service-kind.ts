function normalizeTypeField(typeRaw: string | undefined): string {
  return (typeRaw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function typeTokens(norm: string): string[] {
  return norm.split(/[^a-z0-9]+/).filter(Boolean);
}

export function isArrivalServiceType(typeRaw: string | undefined): boolean {
  // Une arrivée = jamais un départ + token « arrivee ».
  if (isDepartureServiceType(typeRaw)) return false;
  const tokens = typeTokens(normalizeTypeField(typeRaw));
  return tokens.includes("arrivee");
}

/**
 * Détection LARGE d'un départ : tout type contenant « DEP » / « DEPART »
 * (insensible à la casse et aux accents) est un départ.
 *
 * Couvre ainsi les libellés composés mal reconnus auparavant :
 * « DEPART », « SALON DEP », « DEP + TRANS »… Ces missions héritent du
 * comportement Départ (ETA éditable, pas de photo obligatoire au rapport).
 */
export function isDepartureServiceType(typeRaw: string | undefined): boolean {
  return normalizeTypeField(typeRaw).includes("dep");
}

export type ServiceReportKind = "arrival" | "departure" | "transit";

export function detectServiceReportKind(
  typeRaw: string | undefined
): ServiceReportKind {
  // Priorité au départ : « DEP + TRANS » doit être traité comme un départ
  // (et non comme un transit ou une arrivée par défaut).
  if (isDepartureServiceType(typeRaw)) return "departure";
  const tokens = typeTokens(normalizeTypeField(typeRaw));
  if (tokens.includes("arrivee")) return "arrival";
  if (tokens.includes("connexion") || tokens.includes("transit")) return "transit";
  return "arrival";
}

