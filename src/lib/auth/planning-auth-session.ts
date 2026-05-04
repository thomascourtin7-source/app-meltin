import {
  MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT,
  MELTIN_TEAM_REGISTER_NAME_KEY,
} from "@/components/planning/register-team-button";
import { CHAT_USERNAME_STORAGE_KEY } from "@/lib/chat/constants";

export const MELTIN_PLANNING_AUTH_SESSION_KEY = "meltin_planning_auth_session";

export const MELTIN_AUTH_SESSION_CHANGED_EVENT = "meltin_planning_auth_session_changed";

export type PlanningAuthSession = {
  slug: string;
  displayName: string;
  token: string;
};

function parseSession(raw: string | null): PlanningAuthSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const slug = typeof o.slug === "string" ? o.slug.trim() : "";
    const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
    const token = typeof o.token === "string" ? o.token.trim() : "";
    if (!slug || !displayName || !token) return null;
    return { slug, displayName, token };
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

export function hasPlanningAuthSession(): boolean {
  return readPlanningAuthSession() != null;
}

export function persistPlanningAuthSession(session: PlanningAuthSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MELTIN_PLANNING_AUTH_SESSION_KEY,
    JSON.stringify(session)
  );
  window.localStorage.setItem(MELTIN_TEAM_REGISTER_NAME_KEY, session.displayName);
  window.localStorage.setItem(CHAT_USERNAME_STORAGE_KEY, session.displayName);
  window.dispatchEvent(new Event(MELTIN_AUTH_SESSION_CHANGED_EVENT));
  window.dispatchEvent(
    new CustomEvent(MELTIN_TEAM_REGISTER_NAME_CHANGED_EVENT, {
      detail: { name: session.displayName },
    })
  );
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
