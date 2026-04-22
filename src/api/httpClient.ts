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

function identityHeaders(): HeadersInit {
  try {
    const hardwareId = localStorage.getItem('mirror_hardware_id')?.trim();
    const userId = localStorage.getItem('mirror_user_id')?.trim();
    const headers: Record<string, string> = {};
    if (hardwareId) headers['X-Mirror-Hardware-Id'] = hardwareId;
    if (userId) headers['X-Mirror-User-Id'] = userId;
    return headers;
  } catch {
    return {};
  }
}

export function trimBase(base: string): string {
  return base.replace(/\/$/, '');
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${trimBase(baseUrl)}${path}`, {
    ...init,
    headers: {
      ...identityHeaders(),
      ...(init.headers ?? {}),
    },
  });
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
  return (await res.json()) as T;
}

export async function requestVoid(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<void> {
  const res = await fetch(`${trimBase(baseUrl)}${path}`, {
    ...init,
    headers: {
      ...identityHeaders(),
      ...(init.headers ?? {}),
    },
  });
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
}
