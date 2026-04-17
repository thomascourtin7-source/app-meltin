/* Service Web Push : chat + alertes planning (payload JSON). */
self.addEventListener("push", function (event) {
  var data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    try {
      if (event.data) {
        data = JSON.parse(event.data.text());
      }
    } catch (e2) {
      data = {};
    }
  }

  var type = data.type;
  var title;
  var body;
  var tag;
  var openUrl = "/";
  var icon = "/icons/icon-192.png";

  if (type === "planning-update") {
    title = data.title || "🚨 NOUVEAU SERVICE DETECTÉ";
    body = (data.body || "Nouveau transport.").slice(0, 240);
    tag = "planning-" + Date.now();
    openUrl = typeof data.openUrl === "string" ? data.openUrl : "/";
  } else {
    title = data.senderName || data.title || "Meltin";
    body = (data.text || data.body || "Nouveau message").slice(0, 200);
    tag = data.messageId ? "chat-" + data.messageId : "chat-" + title;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      badge: icon,
      tag: tag,
      renotify: type === "planning-update",
      vibrate: type === "planning-update" ? [120, 80, 120] : undefined,
      data: { url: openUrl },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = "/";
  if (
    event.notification.data &&
    typeof event.notification.data === "object" &&
    event.notification.data.url
  ) {
    url = String(event.notification.data.url);
  }
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        var i;
        for (i = 0; i < clientList.length; i++) {
          var c = clientList[i];
          if (c.focus) {
            return c.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
