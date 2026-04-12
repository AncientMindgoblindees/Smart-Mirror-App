const MIRROR_HTTP_STORAGE_KEY = 'mirror_http_base';
const MIRROR_WS_STORAGE_KEY = 'mirror_ws_url';

export type MirrorEnv = 'production' | 'development';

function detectEnv(): MirrorEnv {
  const explicit = (import.meta as unknown as Record<string, Record<string, string>>).env
    ?.VITE_MIRROR_ENV as string | undefined;
  if (explicit === 'production' || explicit === 'development') return explicit;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'development';
  }
  return 'production';
}

const ENV_DEFAULTS: Record<MirrorEnv, { http: string; ws: string }> = {
  production: {
    http: 'https://mirror.smart-mirror.tech',
    ws: 'wss://mirror.smart-mirror.tech/ws/control',
  },
  development: {
    http: 'http://127.0.0.1:8002',
    ws: 'ws://127.0.0.1:8002/ws/control',
  },
};

export function getMirrorEnv(): MirrorEnv {
  return detectEnv();
}

export function getMirrorHttpBase(): string {
  try {
    const stored = localStorage.getItem(MIRROR_HTTP_STORAGE_KEY);
    if (stored?.trim()) return stored.trim();
  } catch { /* ignore */ }
  return ENV_DEFAULTS[detectEnv()].http;
}

export function getMirrorWsUrl(): string {
  try {
    const stored = localStorage.getItem(MIRROR_WS_STORAGE_KEY);
    if (stored?.trim()) return stored.trim();
  } catch { /* ignore */ }
  return ENV_DEFAULTS[detectEnv()].ws;
}

export function setMirrorHttpBase(base: string): void {
  try { localStorage.setItem(MIRROR_HTTP_STORAGE_KEY, base); } catch { /* ignore */ }
}

export function setMirrorWsUrl(url: string): void {
  try { localStorage.setItem(MIRROR_WS_STORAGE_KEY, url); } catch { /* ignore */ }
}
