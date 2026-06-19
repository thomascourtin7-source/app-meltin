import { planningDisplayNameEquals } from "@/lib/planning/planning-team";

/** Administrateurs autorisés à modifier les assignations et le planning « demain ». */
export const ADMINS = [
  "Pravin",
  "Deva",
  "Kumar",
  "Thomas",
  "Simon",
  "Karthik",
  "Javed",
  "Elias",
  "Moubine",
  "JAVED ORDI",
] as const;

export function isPlanningAdminDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  // Full Admin pour TOUS les agents connectés : chacun peut assigner/retirer,
  // éditer les RDV et faire le rapport d'autrui. (La liste ADMINS reste exportée
  // pour la barre de supervision / le seeding des rôles.)
  void ADMINS;
  return true;
}
