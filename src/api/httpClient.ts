import {
  clearMirrorLegacyUserId,
  getMirrorHardwareId,
  getMirrorHardwareToken,
} from '../lib/connectionConfig';
import { ensureFirebaseAuthReady, getCurrentFirebaseIdToken } from '../firebase';

export class ApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function trimBase(base: string): string {
  return base.replace(/\/$/, '');
}

export type RequestAuthMode = 'required' | 'optional' | 'none';

export interface MirrorRequestInit extends RequestInit {
  authMode?: RequestAuthMode;
  includeHardwareHeaders?: boolean;
}

async function buildHeaders(init: MirrorRequestInit): Promise<Headers> {
  const headers = new Headers(init.headers ?? {});
  const includeHardwareHeaders = init.includeHardwareHeaders ?? true;

  clearMirrorLegacyUserId();

  if (includeHardwareHeaders) {
    const hardwareId = getMirrorHardwareId();
    const hardwareToken = getMirrorHardwareToken();
    if (hardwareId && !headers.has('X-Mirror-Hardware-Id')) headers.set('X-Mirror-Hardware-Id', hardwareId);
    if (hardwareToken && !headers.has('X-Mirror-Hardware-Token')) headers.set('X-Mirror-Hardware-Token', hardwareToken);
  }

  const authMode = init.authMode ?? 'required';
  if (authMode === 'none' || headers.has('Authorization')) return headers;

  await ensureFirebaseAuthReady();
  const token = await getCurrentFirebaseIdToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    return headers;
  }

  if (authMode === 'required') {
    throw new ApiError('Authentication required for this request.', 401);
  }

  return headers;
}

async function request(
  baseUrl: string,
  path: string,
  init: MirrorRequestInit = {},
): Promise<Response> {
  const headers = await buildHeaders(init);
  const res = await fetch(`${trimBase(baseUrl)}${path}`, { ...init, headers });
  if (!res.ok) {
    let details = '';
    try {
      details = (await res.text()).trim();
    } catch {
      details = '';
    }
    throw new ApiError(
      `${init.method ?? 'GET'} ${path} failed: ${res.status} ${details || res.statusText}`,
      res.status,
      details || undefined,
    );
  }
  return res;
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: MirrorRequestInit = {},
): Promise<T> {
  const res = await request(baseUrl, path, init);
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function requestVoid(
  baseUrl: string,
  path: string,
  init: MirrorRequestInit = {},
): Promise<void> {
  await request(baseUrl, path, init);
}
