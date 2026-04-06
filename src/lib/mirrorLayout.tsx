import React from 'react';
import {
  Clock,
  Cloud,
  Calendar,
  ListTodo,
  StickyNote,
  Quote,
  ListChecks,
  Home,
  Type,
  Newspaper,
  Sparkles,
} from 'lucide-react';
import type { WidgetConfigOut, WidgetConfigUpdate } from '../types/mirror';
import { clampFreeformPercentBox, normalizeFreeformFromStorage } from './freeformNormalize';
import { standaloneTextWidgetBaseId } from './customWidgetTemplates';

export interface MirrorWidget {
  id: string;
  type?: 'builtin' | 'custom';
  name: string;
  icon: React.ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
  config: Record<string, any>;
}

/** Alias for screens that use the same shape as the mirror canvas widgets. */
export type Widget = MirrorWidget;

/**
 * Lowercase widget id; drop trailing `:digits` except for `custom:*` (keeps unique custom instances).
 * Matches Smart-Mirror `normalizeWidgetTypeId`.
 */
export function normalizeWidgetTypeId(widgetId: string): string {
  const s = widgetId.trim();
  const colon = s.indexOf(':');
  if (colon > 0) {
    const base = s.slice(0, colon).toLowerCase();
    const rest = s.slice(colon + 1);
    if (/^\d+$/.test(rest) && base !== 'custom') {
      return base;
    }
    return `${base}:${rest}`;
  }
  return s.toLowerCase();
}

/** One row per logical `widget_id` after normalization (lowest DB id wins). */
export function dedupeWidgetApiRows(rows: WidgetConfigOut[]): WidgetConfigOut[] {
  const m = new Map<string, WidgetConfigOut>();
  for (const r of rows) {
    const k = normalizeWidgetTypeId(r.widget_id);
    const ex = m.get(k);
    if (!ex || r.id < ex.id) m.set(k, r);
  }
  return [...m.values()].sort((a, b) => a.id - b.id);
}

function readFreeform(row: WidgetConfigOut): { x: number; y: number; width: number; height: number } {
  const raw = row.config_json?.freeform;
  return normalizeFreeformFromStorage(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined);
}

/** Normalized id prefix: `daily_quote:173…` → `daily_quote`, `reminders` → `reminders`. */
export function mirrorWidgetBaseId(widgetId: string): string {
  const id = normalizeWidgetTypeId(widgetId);
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(0, i);
}

function displayName(widgetId: string): string {
  if (widgetId.trim().toLowerCase().startsWith('custom:')) return 'Custom';
  const base = mirrorWidgetBaseId(widgetId);
  const map: Record<string, string> = {
    clock: 'Clock',
    weather: 'Weather',
    calendar: 'Calendar',
    reminders: 'Reminders',
    sticky_note: 'Sticky note',
    daily_quote: 'Daily quote',
    today_list: 'Today’s list',
    household: 'Household',
    minimal_text: 'Minimal text',
    news: 'News',
    virtual_try_on: 'Virtual try-on',
  };
  return map[base] ?? map[widgetId] ?? widgetId;
}

/** Serializable widget row for localStorage (no React nodes). */
export type WidgetLayoutSnapshot = Omit<MirrorWidget, 'icon'>;

export const DEFAULT_WIDGET_SNAPSHOTS: WidgetLayoutSnapshot[] = [
  { id: 'clock', type: 'builtin', name: 'Clock', x: 10, y: 10, width: 35, height: 15, config: { format: '24h', showSeconds: false } },
  { id: 'weather', type: 'builtin', name: 'Weather', x: 55, y: 10, width: 35, height: 15, config: { location: 'San Francisco', unit: 'metric' } },
  { id: 'calendar', type: 'builtin', name: 'Calendar', x: 10, y: 75, width: 35, height: 15, config: { view: 'month', showEvents: true } },
  { id: 'reminders', type: 'builtin', name: 'Reminders', x: 55, y: 75, width: 35, height: 15, config: { limit: 5, showCompleted: false } },
];

export function hydrateWidgetsFromSnapshots(items: WidgetLayoutSnapshot[]): MirrorWidget[] {
  return items.map((item) => {
    const ff = normalizeFreeformFromStorage({ x: item.x, y: item.y, width: item.width, height: item.height });
    const id = normalizeWidgetTypeId(item.id);
    return {
      ...item,
      ...ff,
      id,
      icon: mirrorWidgetIcon(id),
      name: item.name || displayName(id),
    };
  });
}

/** Canvas / list icon for a widget id (supports `sticky_note:173…` instance ids). */
export function mirrorWidgetIcon(widgetId: string): React.ReactNode {
  switch (mirrorWidgetBaseId(widgetId)) {
    case 'clock':
      return <Clock size={18} />;
    case 'weather':
      return <Cloud size={18} />;
    case 'calendar':
      return <Calendar size={18} />;
    case 'reminders':
      return <ListTodo size={18} />;
    case 'sticky_note':
      return <StickyNote size={18} />;
    case 'daily_quote':
      return <Quote size={18} />;
    case 'today_list':
      return <ListChecks size={18} />;
    case 'household':
      return <Home size={18} />;
    case 'minimal_text':
      return <Type size={18} />;
    case 'news':
      return <Newspaper size={18} />;
    case 'virtual_try_on':
      return <Sparkles size={18} />;
    default:
      return <ListTodo size={18} />;
  }
}

export function widgetsFromApi(rows: WidgetConfigOut[]): MirrorWidget[] {
  return dedupeWidgetApiRows(rows).map((row) => {
    const ff = readFreeform(row);
    const cfg: Record<string, unknown> = { ...(row.config_json ?? {}) };
    delete cfg.freeform;
    const normWid = normalizeWidgetTypeId(row.widget_id);
    const isCustom = normWid.startsWith('custom:');
    const textStandaloneBase = standaloneTextWidgetBaseId(normWid);
    const customTitle =
      typeof cfg.title === 'string' ? cfg.title.trim() : typeof cfg.name === 'string' ? cfg.name.trim() : '';
    const name =
      isCustom
        ? customTitle || 'Custom widget'
        : textStandaloneBase && customTitle
          ? customTitle
          : displayName(normWid);
    return {
      id: normWid,
      type: isCustom ? 'custom' : 'builtin',
      name,
      icon: mirrorWidgetIcon(normWid),
      x: ff.x,
      y: ff.y,
      width: ff.width,
      height: ff.height,
      config: cfg,
    };
  });
}

export function buildWidgetPutPayload(
  widgets: MirrorWidget[],
  backendById: Map<string, WidgetConfigOut>
): WidgetConfigUpdate[] {
  return widgets.map((w) => {
    const wid = normalizeWidgetTypeId(w.id);
    const ex = backendById.get(wid);
    const fromServer = (ex?.config_json && typeof ex.config_json === 'object' ? { ...ex.config_json } : {}) as Record<
      string,
      unknown
    >;
    delete fromServer.freeform;
    const cfg: Record<string, unknown> = { ...fromServer, ...w.config };
    delete cfg.freeform;
    cfg.freeform = clampFreeformPercentBox({ x: w.x, y: w.y, width: w.width, height: w.height });
    return {
      id: ex?.id ?? undefined,
      widget_id: wid,
      enabled: ex?.enabled ?? true,
      position_row: ex?.position_row ?? 1,
      position_col: ex?.position_col ?? 1,
      size_rows: ex?.size_rows ?? 2,
      size_cols: ex?.size_cols ?? 2,
      config_json: cfg,
    };
  });
}
