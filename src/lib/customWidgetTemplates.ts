export type WidgetTemplateKind = 'text' | 'reminders';

export interface CustomWidgetTemplate {
  /** Value for the template `<select>`. */
  id: string;
  /** Stored as `widget_id` (one panel per id, e.g. `sticky_note`, `reminders`). */
  mirrorWidgetId: string;
  label: string;
  kind: WidgetTemplateKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text panels only */
  title?: string;
  text?: string;
}

/** Add-widget presets: text panels + extra Reminders instance. */
export const CUSTOM_WIDGET_TEMPLATES: CustomWidgetTemplate[] = [
  {
    id: 'sticky-note',
    mirrorWidgetId: 'sticky_note',
    label: 'Sticky note',
    kind: 'text',
    title: 'Note',
    text: 'Short reminder or idea — open settings (gear) to edit.',
    x: 28,
    y: 36,
    width: 38,
    height: 22,
  },
  {
    id: 'daily-quote',
    mirrorWidgetId: 'daily_quote',
    label: 'Daily quote',
    kind: 'text',
    title: 'Quote',
    text: '“Add a line that motivates you today.”',
    x: 8,
    y: 42,
    width: 84,
    height: 18,
  },
  {
    id: 'today-list',
    mirrorWidgetId: 'today_list',
    label: 'Today’s list',
    kind: 'text',
    title: 'Today',
    text: '• First task\n• Second task\n• Third task',
    x: 10,
    y: 58,
    width: 42,
    height: 28,
  },
  {
    id: 'household',
    mirrorWidgetId: 'household',
    label: 'Household',
    kind: 'text',
    title: 'Household',
    text: 'Trash night • Groceries • Bills',
    x: 52,
    y: 58,
    width: 40,
    height: 24,
  },
  {
    id: 'minimal',
    mirrorWidgetId: 'minimal_text',
    label: 'Minimal text',
    kind: 'text',
    title: 'Message',
    text: 'One line on the mirror.',
    x: 30,
    y: 44,
    width: 44,
    height: 14,
  },
  {
    id: 'reminders-panel',
    mirrorWidgetId: 'reminders',
    label: 'Reminders',
    kind: 'reminders',
    x: 52,
    y: 72,
    width: 38,
    height: 22,
  },
];

export const STANDALONE_TEXT_WIDGET_BASE_IDS = CUSTOM_WIDGET_TEMPLATES.filter((t) => t.kind === 'text').map(
  (t) => t.mirrorWidgetId
);

export function standaloneTextWidgetBaseId(widgetId: string): string | null {
  const norm = widgetId.trim();
  const base = norm.includes(':') ? norm.slice(0, norm.indexOf(':')).toLowerCase() : norm.toLowerCase();
  return STANDALONE_TEXT_WIDGET_BASE_IDS.includes(base) ? base : null;
}
