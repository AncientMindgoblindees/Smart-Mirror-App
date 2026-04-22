const MIRROR_HTTP_STORAGE_KEY = 'mirror_http_base';
const MIRROR_WS_STORAGE_KEY = 'mirror_ws_url';
const MIRROR_HARDWARE_ID_STORAGE_KEY = 'mirror_hardware_id';
const MIRROR_HARDWARE_TOKEN_STORAGE_KEY = 'mirror_hardware_token';
const MIRROR_ACTIVE_USER_ID_STORAGE_KEY = 'mirror_active_user_id';

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

export function getMirrorHardwareId(): string | null {
  try {
    const stored = localStorage.getItem(MIRROR_HARDWARE_ID_STORAGE_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export function setMirrorHardwareId(hardwareId: string): void {
  try {
    if (!hardwareId.trim()) {
      localStorage.removeItem(MIRROR_HARDWARE_ID_STORAGE_KEY);
      return;
    }
    localStorage.setItem(MIRROR_HARDWARE_ID_STORAGE_KEY, hardwareId.trim());
  } catch { /* ignore */ }
}

export function getMirrorHardwareToken(): string | null {
  try {
    const stored = localStorage.getItem(MIRROR_HARDWARE_TOKEN_STORAGE_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export function setMirrorHardwareToken(token: string): void {
  try {
    if (!token.trim()) {
      localStorage.removeItem(MIRROR_HARDWARE_TOKEN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(MIRROR_HARDWARE_TOKEN_STORAGE_KEY, token.trim());
  } catch { /* ignore */ }
}

export function getMirrorActiveUserId(): string | null {
  try {
    const stored = localStorage.getItem(MIRROR_ACTIVE_USER_ID_STORAGE_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export function setMirrorActiveUserId(userId: string): void {
  try {
    if (!userId.trim()) {
      localStorage.removeItem(MIRROR_ACTIVE_USER_ID_STORAGE_KEY);
      return;
    }
    localStorage.setItem(MIRROR_ACTIVE_USER_ID_STORAGE_KEY, userId.trim());
  } catch { /* ignore */ }
}

export function clearMirrorLegacyUserId(): void {
  try {
    localStorage.removeItem(MIRROR_ACTIVE_USER_ID_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function buildScopedWsUrl(baseWsUrl: string): string {
  const hardwareId = getMirrorHardwareId();
  if (!hardwareId) return baseWsUrl;
  try {
    const url = new URL(baseWsUrl);
    if (hardwareId) url.searchParams.set('hardware_id', hardwareId);
    return url.toString();
  } catch {
    return baseWsUrl;
  }
}
