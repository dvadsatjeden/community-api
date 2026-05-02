/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

// Manifest verzie musí ísť vždy na sieť (signal nového deployu). Nie je v precache.
// Rovnaký princíp ako jednadvacet `public/sw.js` — `/version.json` sa v SW vôbec nechytilo.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  try {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.endsWith("/community-app.version.json")) return;
  } catch {
    /* ignore */
  }
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  const data = event.data?.json() as PushPayload | undefined;
  if (!data?.title) return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "dvc-event",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url: string }).url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) { client.focus(); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});
