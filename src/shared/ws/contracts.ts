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

function generateDeviceId(): string {
  const stored = localStorage.getItem('companion_device_id');
  if (stored) return stored;
  const id = `companion-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('companion_device_id', id);
  return id;
}

export function getDeviceId(): string {
  return generateDeviceId();
}

export function createDevicePairEnvelope(sessionId: string, deviceId: string, displayName: string): ControlEnvelope {
  return {
    type: 'DEVICE_PAIR',
    version: 2,
    sessionId,
    timestamp: new Date().toISOString(),
    payload: {
      device_id: deviceId,
      display_name: displayName,
      source: 'mobile-companion',
    },
  };
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
