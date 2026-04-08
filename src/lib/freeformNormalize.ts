import { inferWidgetSizePreset, type WidgetSizePreset } from './widgetSizePresets';

/**
 * Freeform layout: percents of canvas (0–100), same rules as Smart-Mirror `ui/src/api/transforms.ts`.
 * Legacy DB rows may store pixel coords against a 1280×720 reference; treat any value >100 as pixels.
 */

const LEGACY_REF = { width: 1280, height: 720 };

export const DEFAULT_FREEFORM_PERCENT = { x: 10, y: 10, width: 32, height: 20 };

function looksLikeLegacyPixel(f: { x: number; y: number; width: number; height: number }): boolean {
  return f.x > 100 || f.y > 100 || f.width > 100 || f.height > 100;
}

export function clampFreeformPercentBox(f: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
  sizePreset: WidgetSizePreset;
} {
  const width = Math.min(100, Math.max(0.5, f.width));
  const height = Math.min(100, Math.max(0.5, f.height));
  const x = Math.min(Math.max(0, f.x), 100 - width);
  const y = Math.min(Math.max(0, f.y), 100 - height);
  return { x, y, width, height, sizePreset: inferWidgetSizePreset(width, height) };
}

function legacyPixelsToPercent(f: { x: number; y: number; width: number; height: number }) {
  return clampFreeformPercentBox({
    x: (f.x / LEGACY_REF.width) * 100,
    y: (f.y / LEGACY_REF.height) * 100,
    width: (f.width / LEGACY_REF.width) * 100,
    height: (f.height / LEGACY_REF.height) * 100,
  });
}

/** Normalize freeform object from API/storage into 0–100% canvas coordinates. */
export function normalizeFreeformFromStorage(raw: Record<string, unknown> | null | undefined): {
  x: number;
  y: number;
  width: number;
  height: number;
  sizePreset: WidgetSizePreset;
} {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_FREEFORM_PERCENT,
      sizePreset: inferWidgetSizePreset(DEFAULT_FREEFORM_PERCENT.width, DEFAULT_FREEFORM_PERCENT.height),
    };
  }
  const o = raw as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : d;
  const f = {
    x: num('x', DEFAULT_FREEFORM_PERCENT.x),
    y: num('y', DEFAULT_FREEFORM_PERCENT.y),
    width: num('width', DEFAULT_FREEFORM_PERCENT.width),
    height: num('height', DEFAULT_FREEFORM_PERCENT.height),
  };
  if (looksLikeLegacyPixel(f)) return legacyPixelsToPercent(f);
  return clampFreeformPercentBox(f);
}
