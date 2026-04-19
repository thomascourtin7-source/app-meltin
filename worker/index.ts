/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

type PushPayload = {
  type?: string;
  senderName?: string;
  text?: string;
  title?: string;
  body?: string;
  messageId?: string;
  openUrl?: string;
};

self.addEventListener("push", (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    if (event.data) {
      data = event.data.json() as PushPayload;
    }
  } catch {
    try {
      const raw = event.data?.text();
      if (raw) data = JSON.parse(raw) as PushPayload;
    } catch {
      data = { body: "Nouveau message" };
    }
  }

  const icon = "/icons/icon-192x192.png";
  let title: string;
  let body: string;
  let tag: string;
  let openUrl = "/";
  const renotify = true;
  let vibrate: number[] | undefined;

  if (data.type === "planning-update") {
    title = data.title ?? "🚨 NOUVEAU SERVICE DETECTÉ";
    body = (data.body ?? "Nouveau transport.").slice(0, 240);
    tag = `planning-${Date.now()}`;
    openUrl = typeof data.openUrl === "string" ? data.openUrl : "/";
    vibrate = [120, 80, 120];
  } else {
    title = data.senderName ?? data.title ?? "Meltin";
    body = (data.text ?? data.body ?? "Nouveau message").slice(0, 200);
    tag = data.messageId ? `chat-${data.messageId}` : `chat-${title}`;
    if (typeof data.openUrl === "string" && data.openUrl.length > 0) {
      openUrl = data.openUrl;
    }
  }

  const opts = {
    body,
    icon,
    badge: icon,
    tag,
    renotify,
    vibrate,
    data: { url: openUrl },
  } as NotificationOptions & { renotify?: boolean };

  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    typeof event.notification.data === "object" &&
    event.notification.data &&
    "url" in event.notification.data
      ? String((event.notification.data as { url: string }).url)
      : "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});

export {};
