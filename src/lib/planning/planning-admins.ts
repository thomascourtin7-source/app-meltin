import { planningDisplayNameEquals } from "@/lib/planning/planning-team";

/** Administrateurs autorisés à modifier les assignations et le planning « demain ». */
export const ADMINS = ["Javed", "Karthik", "Thomas"] as const;

export function isPlanningAdminDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  return ADMINS.some((admin) => planningDisplayNameEquals(admin, t));
}
