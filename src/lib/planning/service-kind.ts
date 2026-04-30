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
  const tokens = typeTokens(normalizeTypeField(typeRaw));
  return tokens.includes("arrivee");
}

export type ServiceReportKind = "arrival" | "departure" | "transit";

export function detectServiceReportKind(
  typeRaw: string | undefined
): ServiceReportKind {
  const tokens = typeTokens(normalizeTypeField(typeRaw));
  if (tokens.includes("depart")) return "departure";
  if (tokens.includes("arrivee")) return "arrival";
  if (tokens.includes("connexion") || tokens.includes("transit")) return "transit";
  return "arrival";
}

