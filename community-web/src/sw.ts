/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

registerRoute(({ url }) => url.origin === self.location.origin && url.pathname === "/assets/community-app.version.json", new NetworkOnly());
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));
self.skipWaiting();
clientsClaim();

function appUrl(value: unknown): string {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    if (url.origin === self.location.origin) return url.href;
  } catch { /* use home */ }
  return new URL("/", self.location.origin).href;
}

self.addEventListener("push", event => {
  let data: { title?: string; body?: string; url?: string };
  try { data = event.data?.json() ?? {}; } catch { return; }
  if (typeof data.title !== "string") return;
  event.waitUntil(self.registration.showNotification(data.title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icon-192.png", badge: "/icon-192.png", tag: "dvc-event", data: { url: appUrl(data.url) },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = appUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = list.find(client => new URL(client.url).origin === self.location.origin);
    if (client) { await client.navigate(url); await client.focus(); }
    else await self.clients.openWindow(url);
  })());
});
