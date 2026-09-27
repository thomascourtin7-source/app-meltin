import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";

/** En-tête Bearer de la session planning (client). */
export function planningAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = readPlanningAuthSession()?.token?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
