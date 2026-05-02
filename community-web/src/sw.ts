/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// `community-app.version.json` musí ísť na sieť pred precache (signál deployu).
// Samotné `return` bez `respondWith()` fetch nezachytí — Workbox by inak mohol obslúžiť starý manifest.
// NetworkFirst + `cacheWillUpdate` → sieť prvé, runtime cache tento JSON neukladáme (stale buildId).
const communityAppVersionJsonStrategy = new NetworkFirst({
  fetchOptions: { cache: "no-store", credentials: "omit" },
  networkTimeoutSeconds: 3,
  plugins: [
    {
      cacheWillUpdate: async () => null,
    },
  ],
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url: URL;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.endsWith("/community-app.version.json")) return;

  event.respondWith(communityAppVersionJsonStrategy.handle({ event, request: event.request }));
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
