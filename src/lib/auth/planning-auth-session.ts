import {
  MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
  MELTIN_TEAM_REGISTER_NAME_KEY,
} from "@/components/planning/register-team-button";
import type { AgentAuthRole } from "@/lib/auth/agent-role";
import { normalizeAgentRole } from "@/lib/auth/agent-role";
import { CHAT_USERNAME_STORAGE_KEY } from "@/lib/chat/constants";

/** Session planning + jeton serveur ; persistance illimitée (pas d’expiration côté client). */
export const MELTIN_PLANNING_AUTH_SESSION_KEY = "meltin_planning_auth_session";

export const MELTIN_AUTH_SESSION_CHANGED_EVENT = "meltin_planning_auth_session_changed";

export const MELTIN_PLANNING_DEVICE_ID_KEY = "meltin_planning_device_id";

export type PlanningAuthSession = {
  slug: string;
  displayName: string;
  token: string;
  role?: AgentAuthRole;
};

export function getOrCreatePlanningDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage
      .getItem(MELTIN_PLANNING_DEVICE_ID_KEY)
      ?.trim();
    if (existing) return existing;
    const v =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(MELTIN_PLANNING_DEVICE_ID_KEY, v);
    return v;
  } catch {
    return "";
  }
}

function parseSession(raw: string | null): PlanningAuthSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const slug = typeof o.slug === "string" ? o.slug.trim() : "";
    const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
    const token = typeof o.token === "string" ? o.token.trim() : "";
    const roleRaw = typeof o.role === "string" ? o.role.trim() : "";
    const role = roleRaw ? normalizeAgentRole(roleRaw) : undefined;
    if (!slug || !displayName || !token) return null;
    return { slug, displayName, token, ...(role ? { role } : {}) };
  } catch {
    return null;
  }
}

export function readPlanningAuthSession(): PlanningAuthSession | null {
  if (typeof window === "undefined") return null;
  return parseSession(
    window.localStorage.getItem(MELTIN_PLANNING_AUTH_SESSION_KEY)
  );
}

export function subscribePlanningAuthSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => onStoreChange();
  window.addEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, onCustom);
  return () => window.removeEventListener(MELTIN_AUTH_SESSION_CHANGED_EVENT, onCustom);
}

export function hasPlanningAuthSession(): boolean {
  return readPlanningAuthSession() != null;
}

/** Enregistre la session en localStorage jusqu’à déconnexion explicite (aucune TTL appliquée ici). */
export function persistPlanningAuthSession(session: PlanningAuthSession): void {
  if (typeof window === "undefined") return;
  const normalized: PlanningAuthSession = {
    ...session,
    ...(session.role ? { role: normalizeAgentRole(session.role) } : {}),
  };
  window.localStorage.setItem(
    MELTIN_PLANNING_AUTH_SESSION_KEY,
    JSON.stringify(normalized)
  );
  window.localStorage.setItem(MELTIN_TEAM_REGISTER_NAME_KEY, normalized.displayName);
  window.localStorage.setItem(CHAT_USERNAME_STORAGE_KEY, normalized.displayName);
  window.dispatchEvent(new Event(MELTIN_AUTH_SESSION_CHANGED_EVENT));
  window.dispatchEvent(
    new CustomEvent(MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT, {
      detail: { name: normalized.displayName },
    })
  );
}

/** Met à jour le rôle en session locale (ex. après promotion admin). */
export function patchPlanningAuthSessionRole(role: AgentAuthRole): void {
  const session = readPlanningAuthSession();
  if (!session) return;
  persistPlanningAuthSession({ ...session, role: normalizeAgentRole(role) });
}

export function clearPlanningAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(MELTIN_PLANNING_AUTH_SESSION_KEY);
    if (raw) {
      const v = JSON.parse(raw) as unknown;
      const token =
        v &&
        typeof v === "object" &&
        typeof (v as { token?: unknown }).token === "string"
          ? (v as { token: string }).token.trim()
          : "";
      if (token) {
        void fetch("/api/planning-auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
  window.localStorage.removeItem(MELTIN_PLANNING_AUTH_SESSION_KEY);
  window.localStorage.removeItem(MELTIN_TEAM_REGISTER_NAME_KEY);
  window.localStorage.removeItem(CHAT_USERNAME_STORAGE_KEY);
  window.dispatchEvent(new Event(MELTIN_AUTH_SESSION_CHANGED_EVENT));
  window.dispatchEvent(
    new CustomEvent(MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT, {
      detail: { name: "" },
    })
  );
}
