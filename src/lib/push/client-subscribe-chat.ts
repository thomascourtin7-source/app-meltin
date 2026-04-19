"use client";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Copie explicite pour `PushManager.subscribe` (TS + Safari iOS / BufferSource). */
export function toApplicationServerKeyBufferSource(
  key: Uint8Array
): BufferSource {
  const out = new Uint8Array(key.length);
  out.set(key);
  return out;
}

export type ChatPushSubscribeResult =
  | { ok: true }
  | { ok: false; error: string; offline?: boolean };

const READY_TIMEOUT_MS = 15_000;

function getVapidPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
}

function waitForServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(
          new Error(
            "Service Worker indisponible (timeout). Vérifiez que /sw.js est servi et que vous êtes en HTTPS ou sur localhost."
          )
        );
      }, READY_TIMEOUT_MS);
    }),
  ]);
}

/** Même forme que côté serveur (`subscriptions-store`). */
type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

async function postSubscribeToApi(
  subscription: PushSubscriptionJSON,
  displayName: string
): Promise<ChatPushSubscribeResult> {
  const userId = displayName.trim();
  console.log("Envoi du token au serveur pour l'utilisateur:", userId);

  const save = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      userName: displayName,
      senderName: displayName,
    }),
  });

  if (!save.ok) {
    const err: unknown = await save.json().catch(() => ({}));
    const msg =
      err &&
      typeof err === "object" &&
      "error" in err &&
      typeof (err as { error: unknown }).error === "string"
        ? (err as { error: string }).error
        : "Enregistrement refusé.";
    const offlineFromJson =
      typeof err === "object" &&
      err !== null &&
      "offline" in err &&
      (err as { offline: unknown }).offline === true;
    const offline: boolean =
      offlineFromJson ||
      save.status === 503 ||
      save.status === 502 ||
      save.status === 504;
    return { ok: false, error: msg, offline };
  }

  return { ok: true };
}

/**
 * Ré-enregistre une subscription existante (même endpoint) côté serveur,
 * utile après chargement si l’abonnement navigateur existe déjà.
 */
export async function savePushSubscriptionToServer(
  subscription: PushSubscriptionJSON,
  senderName: string
): Promise<ChatPushSubscribeResult> {
  const name = senderName.trim();
  if (name.length < 1) {
    return { ok: false, error: "Prénom requis pour lier les alertes au chat." };
  }
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { ok: false, error: "Subscription Web Push incomplète." };
  }
  return postSubscribeToApi(subscription, name);
}

export type SubscribeChatPushOptions = {
  /** Si true, ne pas rappeler `requestPermission()` (déjà accordée ailleurs, ex. au chargement du site). */
  skipPermissionRequest?: boolean;
};

/**
 * Permission navigateur + abonnement push + enregistrement (`user_name`) via /api/push/subscribe.
 * L’enregistrement du SW (`navigator.serviceWorker.register`) doit être fait avant (ex. Chat.tsx).
 */
export async function subscribeChatPush(
  senderName: string,
  options?: SubscribeChatPushOptions
): Promise<ChatPushSubscribeResult> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { ok: false, error: "Push non pris en charge par ce navigateur." };
  }

  const name = senderName.trim();
  if (name.length < 1) {
    return { ok: false, error: "Prénom requis pour lier les alertes au chat." };
  }

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    window.alert("Clé VAPID manquante");
    return { ok: false, error: "Clé VAPID manquante (NEXT_PUBLIC_VAPID_PUBLIC_KEY)." };
  }

  if (options?.skipPermissionRequest) {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      return { ok: false, error: "Permission de notification requise." };
    }
  } else {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, error: "Permission de notification refusée." };
    }
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await waitForServiceWorkerReady();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Service Worker indisponible.";
    return { ok: false, error: msg };
  }

  const applicationServerKey = toApplicationServerKeyBufferSource(
    urlBase64ToUint8Array(publicKey)
  );
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "NotAllowedError") {
      return {
        ok: false,
        error:
          "Notifications bloquées (Safari : Réglages → Safari → Avancé → données de site, ou Notifications pour ce site).",
      };
    }
    const msg =
      e instanceof Error ? e.message : "Échec de l’abonnement push.";
    return { ok: false, error: msg };
  }

  const raw = sub.toJSON();
  if (raw.endpoint?.includes("push.apple.com")) {
    console.log("Token Safari généré:", sub.toJSON());
  }
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
    return { ok: false, error: "Subscription Web Push incomplète." };
  }
  return postSubscribeToApi(
    {
      endpoint: raw.endpoint,
      expirationTime: raw.expirationTime,
      keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
    },
    name
  );
}
