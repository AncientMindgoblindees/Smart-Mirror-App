import type { WidgetConfigOut, WidgetConfigUpdate } from '../types/mirror';

function trimBase(base: string): string {
  return base.replace(/\/$/, '');
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
