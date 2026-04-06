import type { Widget } from '../../lib/mirrorLayout';

export type ControlEnvelope = {
  type: string;
  version: 2;
  sessionId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export function createSessionId(): string {
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWidgetsSyncEnvelope(sessionId: string, widgets: Widget[]): ControlEnvelope {
  return {
    type: 'WIDGETS_SYNC',
    version: 2,
    sessionId,
    timestamp: new Date().toISOString(),
    payload: {
      source: 'mobile-companion',
      widgets: widgets.map((wi) => ({
        id: wi.id,
        type: wi.type || 'builtin',
        name: wi.name,
        x: wi.x,
        y: wi.y,
        width: wi.width,
        height: wi.height,
        config: wi.config || {},
      })),
    },
  };
}
