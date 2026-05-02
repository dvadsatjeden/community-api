/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Fallback API base when config fetch fails (dev). */
  readonly VITE_DEFAULT_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
/** Krátky hash na build; pri `vite dev` je `"dev"`. */
declare const __APP_BUILD_ID__: string;

declare global {
  interface Window {
    __DVC_BOOT_TIMER?: ReturnType<typeof setTimeout>;
  }
}
