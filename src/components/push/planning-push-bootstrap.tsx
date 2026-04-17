"use client";

import { useEffect } from "react";

import {
  savePushSubscriptionToServer,
  subscribeChatPush,
} from "@/lib/push/client-subscribe-chat";
import { ensureServiceWorkerRegistered } from "@/lib/push/register-sw";

const CHAT_USERNAME_KEY = "meltin_chat_username";
const DEVICE_SENDER_KEY = "meltin_push_planning_device_sender";

function getSenderNameForPush(): string {
  if (typeof window === "undefined") return "Planning";
  const chat = window.localStorage.getItem(CHAT_USERNAME_KEY)?.trim();
  if (chat && chat.length >= 1 && chat.length <= 120) return chat;
  let fallback = window.localStorage.getItem(DEVICE_SENDER_KEY)?.trim();
  if (!fallback || fallback.length < 1) {
    fallback = `Planning-${Math.random().toString(36).slice(2, 9)}`;
    try {
      window.localStorage.setItem(DEVICE_SENDER_KEY, fallback);
    } catch {
      /* quota / mode privé */
    }
  }
  return fallback.slice(0, 120);
}

/**
 * Au chargement : enregistre le SW, demande la permission notifications,
 * abonne l’appareil au Web Push (VAPID) pour recevoir les alertes planning (serveur).
 */
export function PlanningPushBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapid) return;

    let cancelled = false;

    void (async () => {
      await ensureServiceWorkerRegistered();
      if (cancelled) return;

      const perm =
        typeof Notification !== "undefined"
          ? await Notification.requestPermission()
          : "denied";
      if (cancelled || perm !== "granted") return;

      try {
        const reg = await navigator.serviceWorker.ready;
        if (cancelled) return;

        const name = getSenderNameForPush();
        const existing = await reg.pushManager.getSubscription();

        if (existing) {
          const raw = existing.toJSON();
          if (raw.endpoint && raw.keys?.p256dh && raw.keys?.auth) {
            void savePushSubscriptionToServer(
              {
                endpoint: raw.endpoint,
                expirationTime: raw.expirationTime,
                keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
              },
              name
            );
          }
          return;
        }

        await subscribeChatPush(name, { skipPermissionRequest: true });
      } catch {
        /* iOS sans PWA, pas HTTPS, etc. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
