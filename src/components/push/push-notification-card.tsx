"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function urlBase64ToUint8Array(base64String: string): BufferSource {
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

export function PushNotificationCard() {
  const supported =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "subscribed" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/push/vapid-public");
        const data: unknown = await res.json();
        if (
          data &&
          typeof data === "object" &&
          "configured" in data &&
          typeof (data as { configured: unknown }).configured === "boolean"
        ) {
          setVapidConfigured((data as { configured: boolean }).configured);
        }
      } catch {
        setVapidConfigured(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !supported) return;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setStatus("subscribed");
      } catch {
        /* ignore */
      }
    })();
  }, [supported]);

  const subscribe = useCallback(async () => {
    setMessage(null);
    setStatus("loading");

    try {
      const keyRes = await fetch("/api/push/vapid-public");
      const keyData: unknown = await keyRes.json();
      const publicKey =
        keyData &&
        typeof keyData === "object" &&
        "publicKey" in keyData &&
        typeof (keyData as { publicKey: unknown }).publicKey === "string"
          ? (keyData as { publicKey: string }).publicKey
          : "";

      if (!publicKey) {
        setStatus("error");
        setMessage(
          "Définissez NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY pour activer les notifications."
        );
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("error");
        setMessage("Permission de notification refusée.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subscription = sub.toJSON();
      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          userName: "__planning",
          senderName: "__planning",
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
        const offline =
          (err &&
            typeof err === "object" &&
            "offline" in err &&
            (err as { offline: unknown }).offline === true) ||
          save.status === 503 ||
          save.status === 502 ||
          save.status === 504;
        setStatus(offline ? "idle" : "error");
        setMessage(offline ? "Mode hors-ligne" : msg);
        return;
      }

      setStatus("subscribed");
    } catch {
      setStatus("error");
      setMessage(
        "Échec de l’abonnement (HTTPS ou service worker requis en production)."
      );
    }
  }, []);

  if (!supported) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellOff className="size-4" aria-hidden />
            Notifications push
          </CardTitle>
          <CardDescription>
            Ce navigateur ne prend pas en charge Push API ou Service Worker.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4" aria-hidden />
          Notifications push
        </CardTitle>
        <CardDescription>
          Structure prête : abonnement enregistré côté API. Branchez un worker
          personnalisé pour afficher les notifications en tâche de fond si
          besoin — le service Workbox généré par PWA peut suffire pour la mise
          en cache des assets.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!vapidConfigured ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Variables serveur : générez des clés VAPID (ex.{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              npx web-push generate-vapid-keys
            </code>
            ) puis renseignez{" "}
            <code className="font-mono text-[11px]">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>{" "}
            et <code className="font-mono text-[11px]">VAPID_PRIVATE_KEY</code>.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void subscribe()}
            disabled={status === "loading" || status === "subscribed"}
            className="gap-2"
          >
            {status === "loading" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Bell className="size-4" aria-hidden />
            )}
            {status === "subscribed" ? "Abonné" : "Activer les alertes"}
          </Button>
        </div>

        {message ? (
          <p
            className={
              message === "Mode hors-ligne"
                ? "text-sm text-muted-foreground"
                : "text-sm text-destructive"
            }
            role={message === "Mode hors-ligne" ? "status" : "alert"}
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
