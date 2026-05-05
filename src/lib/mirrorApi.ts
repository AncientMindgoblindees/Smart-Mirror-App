import type {
  WidgetConfigOut,
  WidgetConfigUpdate,
} from '../types/mirror';
import { requestJson, requestVoid, trimBase } from '../api/httpClient';
import { routes } from '../api/routes';
import { getMirrorApiToken } from './connectionConfig';

export type MirrorAuthProviderStatus = {
  provider: string;
  connected: boolean;
  status: string;
  scopes?: string | null;
  connected_at?: string | null;
};

export async function mirrorAuthProviders(baseUrl: string): Promise<MirrorAuthProviderStatus[]> {
  return requestJson<MirrorAuthProviderStatus[]>(baseUrl, routes.authProviders);
}

/** Device-code flow: mirror shows QR; user completes on phone. */
export async function mirrorAuthStartDeviceLogin(
  baseUrl: string,
  provider: 'google' | 'microsoft'
): Promise<void> {
  await requestVoid(baseUrl, routes.authLogin(provider), { method: 'POST' });
}

export async function mirrorAuthLogout(baseUrl: string, provider: string): Promise<void> {
  await requestVoid(baseUrl, routes.authLogout(provider), { method: 'DELETE' });
}

/** Full-page redirect URL for browser OAuth (sign in on this device). */
export function mirrorOAuthWebStartUrl(baseUrl: string, provider: 'google' | 'microsoft'): string {
  const raw = `${trimBase(baseUrl)}${routes.oauthStart(provider)}`;
  const token = getMirrorApiToken();
  if (!token) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    return raw;
  }
}

export async function mirrorGetWidgets(baseUrl: string): Promise<WidgetConfigOut[]> {
  return requestJson<WidgetConfigOut[]>(baseUrl, routes.widgets);
}

export async function mirrorPutWidgets(
  baseUrl: string,
  payload: WidgetConfigUpdate[]
): Promise<WidgetConfigOut[]> {
  return requestJson<WidgetConfigOut[]>(baseUrl, routes.widgets, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
