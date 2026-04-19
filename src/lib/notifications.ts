import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";

import { applyVapidDetailsIfPossible } from "@/lib/push/vapid-config";

/**
 * Abonnement Web Push (format stocké en base / `web-push`).
 */
export type WebPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type SendPushNotificationOptions = {
  /** Chat → payload sans `type` (voir service worker). Planning → `planning-update`. */
  variant?: "chat" | "planning";
  messageId?: string;
  /** Libellé pour les logs Vercel (`Tentative d'envoi push pour :`). */
  debugType?: string;
};

function buildPayload(
  title: string,
  body: string,
  url: string,
  options?: SendPushNotificationOptions
): Record<string, unknown> {
  if (options?.variant === "planning") {
    return {
      type: "planning-update",
      title,
      body,
      openUrl: url,
    };
  }
  return {
    title,
    text: body,
    body,
    openUrl: url,
    ...(options?.messageId ? { messageId: options.messageId } : {}),
  };
}

/**
 * Envoie une notification Web Push (VAPID : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
 * `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` / mailto).
 */
export async function sendPushNotification(
  subscription: WebPushSubscriptionInput,
  title: string,
  body: string,
  url: string,
  options?: SendPushNotificationOptions
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (options?.debugType) {
    console.log("Tentative d'envoi push pour :", options.debugType);
  }

  if (!applyVapidDetailsIfPossible()) {
    console.warn("[sendPushNotification] VAPID incomplet — envoi ignoré.");
    return { ok: false, error: "VAPID_NOT_CONFIGURED" };
  }

  const payload = buildPayload(title, body, url, options);
  const endpointPreview = `${subscription.endpoint.slice(0, 56)}…`;

  try {
    await webpush.sendNotification(
      subscription as WebPushSubscription,
      JSON.stringify(payload),
      { TTL: 3600 }
    );
    console.log("[sendPushNotification] envoyé", {
      endpoint: endpointPreview,
      titlePreview: title.slice(0, 48),
    });
    return { ok: true };
  } catch (err: unknown) {
    const status =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
    console.error("[sendPushNotification] échec", {
      endpoint: endpointPreview,
      statusCode: status,
      message: msg,
      tokenExpiredOrInvalid: status === 404 || status === 410,
    });
    return { ok: false, error: msg };
  }
}

/** Corps affiché dans la notification (max 60 caractères + « … »). */
export function truncatePushBody(text: string, maxLen = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}...`;
}
