/**
 * Enregistre le Service Worker applicatif (`public/sw.js`) pour Web Push.
 * Idempotent : plusieurs appels renvoient la même registration.
 */
export async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}
