import type { MirrorWidget, WidgetLayoutSnapshot } from './mirrorLayout';
import { hydrateWidgetsFromSnapshots } from './mirrorLayout';

export const LAYOUT_CACHE_KEY = 'smart_mirror_config_layout_v1';

function widgetsToSnapshots(widgets: MirrorWidget[]): WidgetLayoutSnapshot[] {
  return widgets.map(({ icon: _i, ...rest }) => rest);
}

export function saveLayoutCache(widgets: MirrorWidget[]): void {
  try {
    localStorage.setItem(
      LAYOUT_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), items: widgetsToSnapshots(widgets) })
    );
  } catch {
    /* ignore */
  }
}

export function loadLayoutCache(): MirrorWidget[] | null {
  try {
    const raw = localStorage.getItem(LAYOUT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: WidgetLayoutSnapshot[] };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return hydrateWidgetsFromSnapshots(parsed.items);
  } catch {
    return null;
  }
}
