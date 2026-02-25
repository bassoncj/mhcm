declare const __DEFAULT_SERVER_URL__: string;
declare const __MHCM_VERSION__: string;

/** Default WebSocket server URL, injected from .env at build time. */
export const DEFAULT_SERVER_URL: string = __DEFAULT_SERVER_URL__;

/** Extension version, injected from package.json at build time. */
export const MHCM_VERSION: string = __MHCM_VERSION__;