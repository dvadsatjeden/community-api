
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./community-app.css";

/** Odstránenie cache-bust query po „Načítať“ v update banneri (App.tsx). */
try {
  const u = new URL(window.location.href);
  if (u.searchParams.has("dvc_sw")) {
    u.searchParams.delete("dvc_sw");
    const next = `${u.pathname}${u.search}${u.hash}`;
    window.history.replaceState({}, "", next || "/");
  }
} catch {
  /* ignore */
}

declare global {
  interface Window {
    __DVC_APP__?: { bootedAt: string };
    /** Cleared from App after first paint so boot watchdog can fire if React never mounts. */
    __DVC_BOOT_TIMER?: ReturnType<typeof setTimeout>;
  }
}

const rootElement = document.getElementById("dvadsatjeden-community-app");
if (rootElement) {
  const showBootFailure = (reason: string, detail?: unknown): void => {
    // Keep this very defensive: this runs only if React failed to mount.
    // eslint-disable-next-line no-console
    console.error("[DVC] App failed to boot:", reason, detail);
    const message = document.createElement("p");
    message.className = "dvcEmpty";
    message.textContent = "Aplikáciu sa nepodarilo spustiť. Skús obnoviť stránku.";
    rootElement.replaceChildren(message);
  };

  window.__DVC_BOOT_TIMER = window.setTimeout(() => {
    if (rootElement.textContent?.includes("Načítavam appku")) {
      showBootFailure("Timeout: JS bundle sa nespustil (skript sa pravdepodobne nespustil alebo je zablokovaný).", {
        hint: "Application startup timeout",
      });
    }
  }, 4500);

  try {
    window.__DVC_APP__ = { bootedAt: new Date().toISOString() };
    createRoot(rootElement).render(
      <App />
    );
  } catch (error) {
    if (window.__DVC_BOOT_TIMER != null) {
      window.clearTimeout(window.__DVC_BOOT_TIMER);
      window.__DVC_BOOT_TIMER = undefined;
    }
    showBootFailure("Výnimka pri štarte React aplikácie", error);
  }
}
