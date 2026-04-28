// Must run before @evolu loads (dvcEvolu → createEvolu) — SharedWebWorker uses navigator.locks
import "./navigatorLocksPolyfill";

import React from "react";
import { createRoot } from "react-dom/client";
import { DvcEvoluProvider } from "./evolu/dvcEvolu";
import { App } from "./App";
import "./community-app.css";

declare global {
  interface Window {
    __DVC_APP__?: { bootedAt: string };
  }
}

const rootElement = document.getElementById("dvadsatjeden-community-app");
if (rootElement) {
  const showBootFailure = (reason: string, detail?: unknown): void => {
    // Keep this very defensive: this runs only if React failed to mount.
    // eslint-disable-next-line no-console
    console.error("[DVC] App failed to boot:", reason, detail);
    const safeDetail =
      detail instanceof Error
        ? `${detail.name}: ${detail.message}`
        : detail === undefined
          ? ""
          : (() => {
              try {
                return JSON.stringify(detail);
              } catch {
                return String(detail);
              }
            })();
    rootElement.innerHTML = `
      <div class="dvc" style="padding: 12px 0;">
        <p style="margin:0 0 8px 0; font-weight: 700;">Komunitná appka sa nepodarilo spustiť</p>
        <p style="margin:0 0 8px 0; opacity: 0.85; line-height: 1.6;">
          ${reason}
        </p>
        <p style="margin:0; opacity: 0.8; line-height: 1.6; font-size: 0.95rem;">
          ${safeDetail ? `Detail: <code style="word-break: break-all;">${safeDetail}</code><br/>` : ""}
          Skontroluj Network, či sa načíta <code>community-app.js</code> ako <code>type="module"</code> (HTTP vs HTTPS),
          a či <code>api_base_url</code> v WP nie je <code>127.0.0.1</code> z pohľadu prehliadača.
        </p>
      </div>
    `;
  };

  const bootTimer = window.setTimeout(() => {
    if (rootElement.textContent?.includes("Načítavam appku")) {
      showBootFailure("Timeout: JS bundle sa nespustil (skript sa pravdepodobne nespustil alebo je zablokovaný).", {
        hint: "Hľadaj v Network: community-app.js (blocked/200).",
      });
    }
  }, 4500);

  try {
    window.__DVC_APP__ = { bootedAt: new Date().toISOString() };
    createRoot(rootElement).render(
      <DvcEvoluProvider>
        <App />
      </DvcEvoluProvider>
    );
    window.clearTimeout(bootTimer);
  } catch (error) {
    window.clearTimeout(bootTimer);
    showBootFailure("Výnimka pri štarte React aplikácie", error);
  }
}
