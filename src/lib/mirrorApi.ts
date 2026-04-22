import type {
  CalendarEventsResponse,
  CalendarTasksResponse,
  MirrorProfile,
  WidgetConfigOut,
  WidgetConfigUpdate,
} from '../types/mirror';
import { ApiError, requestJson, requestVoid, trimBase } from '../api/httpClient';
import { routes } from '../api/routes';
import { getMirrorIdentityContext } from './connectionConfig';

export type MirrorAuthProviderStatus = {
  provider: string;
  connected: boolean;
  status: string;
  scopes?: string | null;
  connected_at?: string | null;
};

function requiredIdentity() {
  const identity = getMirrorIdentityContext();
  if (!identity) {
    throw new Error('Mirror identity is not configured. Set hardware id and user id in Settings.');
  }
  return identity;
}

function withMirrorQuery(path: string): string {
  const identity = requiredIdentity();
  const sep = path.includes('?') ? '&' : '?';
  const params = new URLSearchParams({
    hardware_id: identity.hardwareId,
  });
  return `${path}${sep}${params.toString()}`;
}

function withIdentityQuery(path: string): string {
  const identity = requiredIdentity();
  const sep = path.includes('?') ? '&' : '?';
  const params = new URLSearchParams({
    hardware_id: identity.hardwareId,
    user_id: identity.userId,
  });
  return `${path}${sep}${params.toString()}`;
}

export async function mirrorAuthProviders(baseUrl: string): Promise<MirrorAuthProviderStatus[]> {
  return requestJson<MirrorAuthProviderStatus[]>(baseUrl, withIdentityQuery(routes.authProviders));
}

export async function mirrorListProfiles(baseUrl: string): Promise<MirrorProfile[]> {
  return requestJson<MirrorProfile[]>(baseUrl, withMirrorQuery(routes.profileList));
}

export async function mirrorDeleteProfile(baseUrl: string, userId: string): Promise<void> {
  await requestVoid(baseUrl, withMirrorQuery(routes.profileDelete(userId)), { method: 'DELETE' });
}

/** Device-code flow: mirror shows QR; user completes on phone. */
export async function mirrorAuthStartDeviceLogin(
  baseUrl: string,
  provider: 'google'
): Promise<void> {
  await requestVoid(baseUrl, withIdentityQuery(routes.authLogin(provider)), { method: 'POST' });
}

export async function mirrorAuthLogout(baseUrl: string, provider: string): Promise<void> {
  await requestVoid(baseUrl, withIdentityQuery(routes.authLogout(provider)), { method: 'DELETE' });
}

/** Full-page redirect URL for browser Google OAuth on the mirror backend. */
export function mirrorOAuthWebStartUrl(baseUrl: string, provider: 'google'): string {
  return `${trimBase(baseUrl)}${withIdentityQuery(routes.oauthStart(provider))}&source=browser`;
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
