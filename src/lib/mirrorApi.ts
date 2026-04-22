import type {
  CalendarEventsResponse,
  CalendarTasksResponse,
  MirrorAuthPairingFinalizeRequest,
  MirrorAuthPairingRedeemRequest,
  MirrorAuthPairingRedeemResponse,
  MirrorAuthPairingSession,
  MirrorAuthPairingStartRequest,
  MirrorAuthPairingStatusResponse,
  MirrorAuthPairingTokenExchangeRequest,
  MirrorAuthPairingTokenExchangeResponse,
  MirrorAuthProviderStatus,
  MirrorOAuthProvider,
  MirrorSessionResponse,
  WidgetConfigOut,
  WidgetConfigUpdate,
} from '../types/mirror';
import { ApiError, requestJson, requestVoid, trimBase } from '../api/httpClient';
import { routes } from '../api/routes';

export type { MirrorAuthProviderStatus } from '../types/mirror';

export async function mirrorGetSession(baseUrl: string): Promise<MirrorSessionResponse> {
  return requestJson<MirrorSessionResponse>(baseUrl, routes.sessionMe);
}

export async function mirrorAuthProviders(baseUrl: string): Promise<MirrorAuthProviderStatus[]> {
  return requestJson<MirrorAuthProviderStatus[]>(baseUrl, routes.authProviders);
}

export async function mirrorStartAuthPairing(
  baseUrl: string,
  payload: MirrorAuthPairingStartRequest,
): Promise<MirrorAuthPairingSession> {
  return requestJson<MirrorAuthPairingSession>(baseUrl, routes.authPairings, {
    method: 'POST',
    authMode: 'optional',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function mirrorRedeemAuthPairing(
  baseUrl: string,
  payload: MirrorAuthPairingRedeemRequest,
): Promise<MirrorAuthPairingRedeemResponse> {
  return requestJson<MirrorAuthPairingRedeemResponse>(baseUrl, routes.authPairingRedeem, {
    method: 'POST',
    authMode: 'optional',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function mirrorGetAuthPairing(
  baseUrl: string,
  pairingId: string,
): Promise<MirrorAuthPairingStatusResponse> {
  return requestJson<MirrorAuthPairingStatusResponse>(baseUrl, routes.authPairingById(pairingId), {
    authMode: 'optional',
  });
}

export async function mirrorFinalizeAuthPairing(
  baseUrl: string,
  pairingId: string,
  payload: MirrorAuthPairingFinalizeRequest = {},
): Promise<MirrorAuthPairingStatusResponse> {
  return requestJson<MirrorAuthPairingStatusResponse>(baseUrl, routes.authPairingFinalize(pairingId), {
    method: 'POST',
    authMode: 'optional',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function mirrorExchangeAuthPairingToken(
  baseUrl: string,
  pairingId: string,
  payload: MirrorAuthPairingTokenExchangeRequest = {},
): Promise<MirrorAuthPairingTokenExchangeResponse> {
  return requestJson<MirrorAuthPairingTokenExchangeResponse>(
    baseUrl,
    routes.authPairingExchangeToken(pairingId),
    {
      method: 'POST',
      authMode: 'optional',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

/** Legacy device-code entrypoint kept for compatibility while newer UIs migrate to pairing sessions. */
export async function mirrorAuthStartDeviceLogin(
  baseUrl: string,
  provider: MirrorOAuthProvider,
): Promise<void> {
  await mirrorStartAuthPairing(baseUrl, { provider, intent: 'link_provider' });
}

export async function mirrorAuthLogout(baseUrl: string, provider: string): Promise<void> {
  await requestVoid(baseUrl, routes.authLogout(provider), { method: 'DELETE' });
}

/** Full-page redirect URL for browser OAuth (sign in on this device). */
export function mirrorOAuthWebStartUrl(
  baseUrl: string,
  provider: MirrorOAuthProvider,
  options?: {
    pairingId?: string | null;
    redirectTo?: string | null;
  },
): string {
  const url = new URL(`${trimBase(baseUrl)}${routes.oauthStart(provider)}`);
  if (options?.pairingId) url.searchParams.set('pairing_id', options.pairingId);
  if (options?.redirectTo) url.searchParams.set('redirect_to', options.redirectTo);
  return url.toString();
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

export async function mirrorGetCalendarEvents(
  baseUrl: string,
  opts?: { days?: number; provider?: string },
): Promise<CalendarEventsResponse> {
  try {
    return await requestJson<CalendarEventsResponse>(baseUrl, routes.calendarEvents(opts?.days, opts?.provider));
  } catch (error) {
    // Older mirror versions may not expose calendar routes yet.
    if (error instanceof ApiError && error.status === 404) {
      return { events: [], providers: [], last_sync: null };
    }
    throw error;
  }
}

export async function mirrorGetCalendarTasks(
  baseUrl: string,
  opts?: { provider?: string },
): Promise<CalendarTasksResponse> {
  try {
    return await requestJson<CalendarTasksResponse>(baseUrl, routes.calendarTasks(opts?.provider));
  } catch (error) {
    // Older mirror versions may not expose task routes yet.
    if (error instanceof ApiError && error.status === 404) {
      return { tasks: [], providers: [], last_sync: null };
    }
    throw error;
  }
}
