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

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${trimBase(baseUrl)}${path}`, init);
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
  const res = await fetch(`${trimBase(baseUrl)}${path}`, init);
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
