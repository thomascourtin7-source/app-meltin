/* Service Web Push : chat + alertes planning (payload JSON). */
self.addEventListener("push", function (event) {
  event.waitUntil(
    Promise.resolve()
      .then(function () {
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
        var icon = "/icons/icon-192x192.png";

        if (type === "planning-update") {
          title = data.title || "🚨 NOUVEAU SERVICE DETECTÉ";
          body = (data.body || "Nouveau transport.").slice(0, 240);
          tag = "planning-" + Date.now();
          openUrl = typeof data.openUrl === "string" ? data.openUrl : "/";
        } else {
          title = data.senderName || data.title || "Meltin";
          body = (data.text || data.body || "Nouveau message").slice(0, 200);
          tag = data.messageId ? "chat-" + data.messageId : "chat-" + title;
          if (typeof data.openUrl === "string" && data.openUrl.length > 0) {
            openUrl = data.openUrl;
          }
        }

        return self.registration.showNotification(title, {
          body: body,
          icon: icon,
          badge: icon,
          tag: tag,
          renotify: type === "planning-update",
          vibrate: type === "planning-update" ? [120, 80, 120] : undefined,
          data: { url: openUrl },
        }).then(function () {
          // Réveil UI : force refresh immédiat côté app (planning)
          // même si l’utilisateur ne clique pas sur la notif.
          return clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then(function (clientList) {
              clientList.forEach(function (c) {
                try {
                  c.postMessage({
                    type: "planning-push-received",
                    at: Date.now(),
                    openUrl: openUrl,
                  });
                } catch (e) {
                  /* ignore */
                }
              });
            });
        });
      })
      .catch(function (err) {
        console.error("[sw push]", err && err.name ? err.name : err);
        if (err && err.name === "NotAllowedError") {
          console.error(
            "[sw push] NotAllowedError : vérifiez les notifications pour ce site (Safari iOS)."
          );
        }
        return self.registration.showNotification("Meltin", {
          body: "Alerte reçue (affichage partiel).",
          icon: "/icons/icon-192x192.png",
          tag: "push-fallback-" + Date.now(),
          data: { url: "/" },
        }).catch(function (e2) {
          console.error("[sw push] fallback notification failed", e2);
        });
      })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var data =
    event.notification && typeof event.notification.data === "object"
      ? event.notification.data
      : {};
  var url = typeof data.url === "string" && data.url ? data.url : "/";

  // Le service ciblé (et sa date) est transporté dans l'URL d'ouverture
  // (?serviceId=…&date=…). On l'extrait pour permettre un routage direct.
  var serviceId = "";
  var serviceDate = "";
  try {
    var parsed = new URL(url, self.location.origin);
    serviceId = parsed.searchParams.get("serviceId") || "";
    serviceDate = parsed.searchParams.get("date") || "";
  } catch (e) {
    /* URL relative invalide : on garde les valeurs vides */
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        var i;
        var routingMessage = {
          type: "planning-notification-click",
          url: url,
          serviceId: serviceId,
          date: serviceDate,
          at: Date.now(),
        };

        // App déjà ouverte : on informe chaque fenêtre du service à afficher
        // (routage in-app sans rechargement) puis on en place une au premier plan.
        for (i = 0; i < clientList.length; i++) {
          try {
            clientList[i].postMessage(routingMessage);
          } catch (e) {
            /* ignore */
          }
        }
        for (i = 0; i < clientList.length; i++) {
          if (clientList[i].focus) {
            return clientList[i].focus();
          }
        }

        // Aucune fenêtre ouverte : on ouvre directement sur l'URL ciblée.
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
