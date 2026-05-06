export type ThemeSelection = {
  widgetTheme: string;
  backgroundTheme: string;
};

export type ThemePreset = {
  id: string;
  label: string;
  hint: string;
  colors: string[];
};

export const WIDGET_THEME_PRESETS: ThemePreset[] = [
  { id: 'glass-cyan', label: 'Glass Cyan', hint: 'Classic mirror glass', colors: ['#5ee1d9', '#7df3eb'] },
  { id: 'steel-mono', label: 'Steel Mono', hint: 'Neutral metallic', colors: ['#a8b7d5', '#c8d3e8'] },
  { id: 'amber-gold', label: 'Amber Gold', hint: 'Warm brass glow', colors: ['#ffbe63', '#ffd79a'] },
  { id: 'pearl-white', label: 'Pearl White', hint: 'Clean white crystal', colors: ['#7da0cf', '#ffffff'] },
  { id: 'gloss-black', label: 'Gloss Black', hint: 'High contrast glossy', colors: ['#9eaec8', '#111827'] },
  { id: 'mint-neon', label: 'Mint Neon', hint: 'Bright modern accent', colors: ['#60e8bf', '#86f6d3'] },
];

export const BACKGROUND_THEME_PRESETS: ThemePreset[] = [
  { id: 'noir', label: 'Noir', hint: 'Dark black ambient', colors: ['#030409', '#111827'] },
  { id: 'frost-blue', label: 'Frost Blue', hint: 'Cool cyan atmosphere', colors: ['#07111f', '#1d4ed8'] },
  { id: 'dawn-amber', label: 'Dawn Amber', hint: 'Warm sunset ambient', colors: ['#160b05', '#b45309'] },
  { id: 'studio-white', label: 'Studio White', hint: 'Soft white mirror room', colors: ['#e5e7eb', '#94a3b8'] },
  { id: 'graphite', label: 'Graphite', hint: 'Glossy deep charcoal', colors: ['#0a0a0f', '#334155'] },
  { id: 'emerald', label: 'Emerald', hint: 'Calm green lounge glow', colors: ['#04130e', '#047857'] },
];

const LEGACY_THEME_MAP: Record<string, ThemeSelection> = {
  dark: { widgetTheme: 'glass-cyan', backgroundTheme: 'noir' },
  'mirror-dark': { widgetTheme: 'glass-cyan', backgroundTheme: 'noir' },
  'frost-blue': { widgetTheme: 'glass-cyan', backgroundTheme: 'frost-blue' },
  'warm-amber': { widgetTheme: 'amber-gold', backgroundTheme: 'dawn-amber' },
  'forest-glass': { widgetTheme: 'glass-cyan', backgroundTheme: 'frost-blue' },
  'mono-steel': { widgetTheme: 'steel-mono', backgroundTheme: 'noir' },
  light: { widgetTheme: 'steel-mono', backgroundTheme: 'frost-blue' },
  'studio-white': { widgetTheme: 'pearl-white', backgroundTheme: 'studio-white' },
  graphite: { widgetTheme: 'gloss-black', backgroundTheme: 'graphite' },
};

const WIDGET_SET = new Set(WIDGET_THEME_PRESETS.map((theme) => theme.id));
const BACKGROUND_SET = new Set(BACKGROUND_THEME_PRESETS.map((theme) => theme.id));

export function serializeThemeSelection(selection: ThemeSelection): string {
  return `w:${selection.widgetTheme}|b:${selection.backgroundTheme}`;
}

export function parseThemeSelection(input: string | null | undefined): ThemeSelection {
  const raw = (input || '').trim();
  if (LEGACY_THEME_MAP[raw]) return LEGACY_THEME_MAP[raw];

  const out: ThemeSelection = {
    widgetTheme: 'glass-cyan',
    backgroundTheme: 'noir',
  };

  for (const piece of raw.split('|')) {
    const trimmed = piece.trim();
    if (trimmed.startsWith('w:')) {
      const value = trimmed.slice(2);
      if (WIDGET_SET.has(value)) out.widgetTheme = value;
    }
    if (trimmed.startsWith('b:')) {
      const value = trimmed.slice(2);
      if (BACKGROUND_SET.has(value)) out.backgroundTheme = value;
    }
  }

  return out;
}

export function getWidgetThemePreset(themeId: string): ThemePreset {
  return WIDGET_THEME_PRESETS.find((theme) => theme.id === themeId) ?? WIDGET_THEME_PRESETS[0];
}

export function getBackgroundThemePreset(themeId: string): ThemePreset {
  return BACKGROUND_THEME_PRESETS.find((theme) => theme.id === themeId) ?? BACKGROUND_THEME_PRESETS[0];
}
