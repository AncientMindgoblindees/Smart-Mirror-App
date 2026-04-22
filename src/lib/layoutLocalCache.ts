import type { MirrorWidget, WidgetLayoutSnapshot } from './mirrorLayout';
import { hydrateWidgetsFromSnapshots } from './mirrorLayout';

export const LAYOUT_CACHE_KEY = 'smart_mirror_config_layout_v1';

function scopedLayoutCacheKey(userId?: string | null): string {
  const normalized = userId?.trim();
  return normalized ? `${LAYOUT_CACHE_KEY}:${normalized}` : LAYOUT_CACHE_KEY;
}

function widgetsToSnapshots(widgets: MirrorWidget[]): WidgetLayoutSnapshot[] {
  return widgets.map(({ icon: _i, ...rest }) => rest);
}

export function saveLayoutCache(widgets: MirrorWidget[], userId?: string | null): void {
  try {
    localStorage.setItem(
      scopedLayoutCacheKey(userId),
      JSON.stringify({ savedAt: Date.now(), items: widgetsToSnapshots(widgets) })
    );
  } catch {
    /* ignore */
  }
}

export function loadLayoutCache(userId?: string | null): MirrorWidget[] | null {
  try {
    const scopedKey = scopedLayoutCacheKey(userId);
    const raw = localStorage.getItem(scopedKey) ?? (userId ? localStorage.getItem(LAYOUT_CACHE_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: WidgetLayoutSnapshot[] };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    if (userId && !localStorage.getItem(scopedKey)) {
      localStorage.setItem(scopedKey, raw);
      localStorage.removeItem(LAYOUT_CACHE_KEY);
    }
    return hydrateWidgetsFromSnapshots(parsed.items);
  } catch {
    return null;
  }
}

export function clearLayoutCache(userId?: string | null): void {
  try {
    localStorage.removeItem(scopedLayoutCacheKey(userId));
    if (userId) localStorage.removeItem(LAYOUT_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
