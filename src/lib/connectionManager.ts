import { getMirrorWsUrl } from './connectionConfig';
import {
  createDevicePairEnvelope,
  createSessionId,
  getDeviceId,
  type ControlEnvelope,
} from '../shared/ws/contracts';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export type ConnectionManagerEvents = {
  onStatusChange?: (status: ConnectionStatus) => void;
  onMessage?: (data: Record<string, unknown>) => void;
};

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

export class MirrorConnectionManager {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = BACKOFF_INITIAL_MS;
  private disposed = false;
  private readonly sessionId: string;
  private events: ConnectionManagerEvents;
  private wsUrl: string;

  constructor(events: ConnectionManagerEvents, wsUrl?: string) {
    this.events = events;
    this.sessionId = createSessionId();
    this.wsUrl = wsUrl ?? getMirrorWsUrl();
  }

  setWsUrl(url: string): void {
    if (url === this.wsUrl) return;
    this.wsUrl = url;
    if (this.status !== 'DISCONNECTED') {
      this.disconnect();
      this.connect();
    }
  }

  updateEvents(events: ConnectionManagerEvents): void {
    this.events = events;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  connect(): void {
    if (this.disposed) return;
    this.closeSocket();
    this.clearReconnectTimer();
    this.setStatus('CONNECTING');

    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.backoffMs = BACKOFF_INITIAL_MS;
        this.setStatus('CONNECTED');
        const pair = createDevicePairEnvelope(
          this.sessionId,
          getDeviceId(),
          'Companion App',
        );
        this.send(pair);
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        this.setStatus('DISCONNECTED');
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as Record<string, unknown>;
          this.events.onMessage?.(data);
        } catch { /* ignore malformed */ }
      };
    } catch {
      this.setStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.closeSocket();
    this.setStatus('DISCONNECTED');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }

  send(envelope: ControlEnvelope | Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
      return true;
    }
    return false;
  }

  private setStatus(next: ConnectionStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.events.onStatusChange?.(next);
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
    }
  }
}
