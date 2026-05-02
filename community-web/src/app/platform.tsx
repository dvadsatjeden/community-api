import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type PlatformMode = "embedded" | "standalone";

export function detectPlatformMode(): PlatformMode {
  const el = document.getElementById("dvadsatjeden-community-app");
  const url = el?.dataset.configUrl ?? "/wp-json/dvadsatjeden/v1/config";
  return url.includes("/wp-json/") ? "embedded" : "standalone";
}

type PlatformContextValue = {
  mode: PlatformMode;
  standaloneAppUrl: string | null;
  setStandaloneAppUrl: (v: string | null) => void;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider(props: { children: ReactNode }): React.ReactElement {
  const [mode] = useState<PlatformMode>(detectPlatformMode);
  const [standaloneAppUrl, setStandaloneAppUrl] = useState<string | null>(null);
  const value = useMemo(
    () => ({ mode, standaloneAppUrl, setStandaloneAppUrl }),
    [mode, standaloneAppUrl],
  );
  return <PlatformContext.Provider value={value}>{props.children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const v = useContext(PlatformContext);
  if (!v) throw new Error("usePlatform must be used within PlatformProvider");
  return v;
}

export function EmbeddedOnly(props: { children: ReactNode }): React.ReactElement | null {
  const { mode } = usePlatform();
  return mode === "embedded" ? <>{props.children}</> : null;
}

export function StandaloneOnly(props: { children: ReactNode }): React.ReactElement | null {
  const { mode } = usePlatform();
  return mode === "standalone" ? <>{props.children}</> : null;
}
