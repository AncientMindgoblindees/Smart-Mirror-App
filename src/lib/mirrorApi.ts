import type { WidgetConfigOut, WidgetConfigUpdate } from '../types/mirror';

function trimBase(base: string): string {
  return base.replace(/\/$/, '');
}

export type MirrorAuthProviderStatus = {
  provider: string;
  connected: boolean;
  status: string;
  scopes?: string | null;
  connected_at?: string | null;
};

export async function mirrorAuthProviders(baseUrl: string): Promise<MirrorAuthProviderStatus[]> {
  const url = `${trimBase(baseUrl)}/api/auth/providers`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET auth providers failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<MirrorAuthProviderStatus[]>;
}

/** Device-code flow: mirror shows QR; user completes on phone. */
export async function mirrorAuthStartDeviceLogin(
  baseUrl: string,
  provider: 'google' | 'microsoft'
): Promise<void> {
  const url = `${trimBase(baseUrl)}/api/auth/login/${provider}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Start login failed: ${res.status} ${text}`);
  }
}

export async function mirrorAuthLogout(baseUrl: string, provider: string): Promise<void> {
  const url = `${trimBase(baseUrl)}/api/auth/logout/${provider}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Logout failed: ${res.status} ${res.statusText}`);
  }
}

/** Full-page redirect URL for browser OAuth (sign in on this device). */
export function mirrorOAuthWebStartUrl(baseUrl: string, provider: 'google' | 'microsoft'): string {
  return `${trimBase(baseUrl)}/api/oauth/${provider}/start`;
}

export async function mirrorGetWidgets(baseUrl: string): Promise<WidgetConfigOut[]> {
  const url = `${trimBase(baseUrl)}/api/widgets/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET widgets failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<WidgetConfigOut[]>;
}

export async function mirrorPutWidgets(
  baseUrl: string,
  payload: WidgetConfigUpdate[]
): Promise<WidgetConfigOut[]> {
  const url = `${trimBase(baseUrl)}/api/widgets/`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`PUT widgets failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<WidgetConfigOut[]>;
}
