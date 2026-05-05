import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Shirt, 
  Upload, 
  X,
  Loader2,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { cn } from './lib/utils';
import type { Widget } from './lib/mirrorLayout';
import {
  widgetsFromApi,
  buildWidgetPutPayload,
  hydrateWidgetsFromSnapshots,
  DEFAULT_WIDGET_SNAPSHOTS,
  mirrorWidgetIcon,
  mirrorWidgetBaseId,
  normalizeWidgetTypeId,
  dedupeWidgetApiRows,
} from './lib/mirrorLayout';
import { loadLayoutCache, saveLayoutCache } from './lib/layoutLocalCache';
import {
  mirrorGetWidgets,
  mirrorPutWidgets,
  mirrorAuthProviders,
  mirrorAuthStartDeviceLogin,
  mirrorAuthLogout,
  mirrorOAuthWebStartUrl,
  type MirrorAuthProviderStatus,
} from './lib/mirrorApi';
import { CUSTOM_WIDGET_TEMPLATES, standaloneTextWidgetBaseId } from './lib/customWidgetTemplates';
import type { WidgetConfigOut } from './types/mirror';
import { WIDGETS_REMOTE_UPDATED_EVENT, createSessionId, createWidgetsSyncEnvelope } from './shared/ws/contracts';
import { MirrorConnectionManager } from './lib/connectionManager';
import {
  getMirrorApiToken,
  getMirrorHttpBase,
  getMirrorWsUrl,
  setMirrorApiToken as persistMirrorApiToken,
  setMirrorHttpBase as persistMirrorHttpBase,
  setMirrorWsUrl as persistMirrorWsUrl,
} from './lib/connectionConfig';
import { FluidDropdown } from './components/ui/fluid-dropdown';
import { WIDGET_SIZE_PRESETS, inferWidgetSizePreset, type WidgetSizePreset } from './lib/widgetSizePresets';
import type { WidgetTemplateCategory } from './lib/customWidgetTemplates';
import {
  CLOTHING_CATEGORIES,
  createClothingWithImage,
  deleteClothingItem,
  listClothingItems,
  primaryImageUrl,
  type ClothingItem,
  type ClothingItemCreate,
} from './features/wardrobe/clothingApi';
import { useWardrobeActions } from './features/wardrobe/useWardrobeActions';

type HttpSyncState = 'idle' | 'pulling' | 'pushing' | 'saved' | 'error';

function layoutSyncLabel(mirrorHttpBase: string, httpSyncState: HttpSyncState): string {
  if (!mirrorHttpBase.trim()) return 'Local layout';
  if (httpSyncState === 'pulling') return 'Refreshing';
  if (httpSyncState === 'pushing') return 'Saving';
  if (httpSyncState === 'saved') return 'Synced';
  if (httpSyncState === 'error') return 'Sync issue';
  return 'Mirror sync';
}

function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function mirrorHttpFallbackFromWindow(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8002';
  const host = window.location.hostname;
  return isLoopbackHost(host) ? 'http://127.0.0.1:8002' : `http://${host}:8002`;
}

function parseHost(rawBase: string): string {
  try {
    return new URL(rawBase).hostname;
  } catch {
    return '';
  }
}

const SIZE_DROPDOWN_ITEMS: Array<{ id: WidgetSizePreset; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

const TEMPLATE_CATEGORY_ITEMS: Array<{
  id: 'all' | WidgetTemplateCategory;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'desk', label: 'Desk' },
  { id: 'tech', label: 'Tech' },
  { id: 'home', label: 'Home' },
];

const CLOCK_FORMAT_ITEMS = [
  { id: '12h', label: '12-hour' },
  { id: '24h', label: '24-hour' },
] as const;

const WEATHER_UNIT_ITEMS = [
  { id: 'metric', label: 'Metric (°C)' },
  { id: 'imperial', label: 'Imperial (°F)' },
] as const;

const CALENDAR_VIEW_ITEMS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
] as const;

const CALENDAR_TIME_FORMAT_ITEMS = [
  { id: '12h', label: '12-hour' },
  { id: '24h', label: '24-hour' },
] as const;

const CLOTHING_CATEGORY_ITEMS = CLOTHING_CATEGORIES.map((category) => ({
  id: category,
  label: category,
}));

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
}

function cloneWidgetForSettingsDraft(w: Widget): Widget {
  return {
    ...w,
    config: { ...w.config },
  };
}

// --- Components ---

const GlassCard = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn(
      "relative bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl p-4 transition-all duration-300 hover:bg-[var(--glass-hover)] hover:shadow-[var(--glow-widget-hover)] shadow-[var(--glow-widget)] overflow-hidden",
      className
    )}
  >
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

type MirrorWidgetProps = {
  widget: Widget;
  onUpdate: (id: string, updates: Partial<Widget>) => void;
  onResizeCommit: (id: string, width: number, height: number) => void;
  onConfigOpen: (widget: Widget) => void;
  onRemove: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
};

const MirrorWidget: React.ComponentType<MirrorWidgetProps> = ({
  widget,
  onUpdate,
  onResizeCommit,
  onConfigOpen,
  onRemove,
  containerRef
}) => {
  const activeInteractionRef = useRef<null | (() => void)>(null);
  const MIN_WIDGET_PERCENT = 1;
  const MAX_PERCENT = 100;

  const clearInteraction = useCallback(() => {
    activeInteractionRef.current?.();
    activeInteractionRef.current = null;
  }, []);
  const widgetAreaRatio = Math.sqrt((widget.width * widget.height) / (35 * 15));
  const readabilityScale = Math.max(0.85, Math.min(1.75, widgetAreaRatio));
  const iconSize = Math.round(Math.max(14, Math.min(34, 18 * readabilityScale)));
  const labelFontPx = Math.max(10, Math.min(18, 10 * readabilityScale));
  const cardPaddingPx = Math.max(8, Math.min(18, 10 * readabilityScale));
  const renderedIcon = React.isValidElement(widget.icon)
    ? React.cloneElement(widget.icon as React.ReactElement<{ size?: number }>, { size: iconSize })
    : widget.icon;

  useEffect(() => () => clearInteraction(), [clearInteraction]);

  const startInteraction = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      mode: 'move' | 'resize'
    ) => {
      if (e.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;
      const startRect = container.getBoundingClientRect();
      if (!startRect.width || !startRect.height) return;

      const origin = {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height,
      };
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;

      const target = e.currentTarget;
      if (target instanceof HTMLElement) {
        target.setPointerCapture(pointerId);
      }

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dxPercent = ((ev.clientX - startX) / startRect.width) * MAX_PERCENT;
        const dyPercent = ((ev.clientY - startY) / startRect.height) * MAX_PERCENT;

        if (mode === 'move') {
          const x = Math.min(
            Math.max(0, origin.x + dxPercent),
            Math.max(0, MAX_PERCENT - origin.width)
          );
          const y = Math.min(
            Math.max(0, origin.y + dyPercent),
            Math.max(0, MAX_PERCENT - origin.height)
          );
          onUpdate(widget.id, { x, y });
          return;
        }

        const width = Math.min(
          Math.max(MIN_WIDGET_PERCENT, origin.width + dxPercent),
          Math.max(MIN_WIDGET_PERCENT, MAX_PERCENT - origin.x)
        );
        const height = Math.min(
          Math.max(MIN_WIDGET_PERCENT, origin.height + dyPercent),
          Math.max(MIN_WIDGET_PERCENT, MAX_PERCENT - origin.y)
        );
        onUpdate(widget.id, { width, height });
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (mode === 'resize') {
          const dxPercent = ((ev.clientX - startX) / startRect.width) * MAX_PERCENT;
          const dyPercent = ((ev.clientY - startY) / startRect.height) * MAX_PERCENT;
          const width = Math.min(
            Math.max(MIN_WIDGET_PERCENT, origin.width + dxPercent),
            Math.max(MIN_WIDGET_PERCENT, MAX_PERCENT - origin.x)
          );
          const height = Math.min(
            Math.max(MIN_WIDGET_PERCENT, origin.height + dyPercent),
            Math.max(MIN_WIDGET_PERCENT, MAX_PERCENT - origin.y)
          );
          onResizeCommit(widget.id, width, height);
        }
        clearInteraction();
      };

      clearInteraction();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      activeInteractionRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (target instanceof HTMLElement) {
          try {
            target.releasePointerCapture(pointerId);
          } catch {
            // Ignore capture release errors when gesture already ended.
          }
        }
      };

      e.preventDefault();
      e.stopPropagation();
    },
    [clearInteraction, containerRef, onResizeCommit, onUpdate, widget.height, widget.id, widget.width, widget.x, widget.y]
  );

  return (
    <motion.div
      initial={false}
      onPointerDown={(e) => {
        const origin = e.target as Element | null;
        if (origin?.closest('.widget-resize-handle')) return;
        if (origin?.closest('button')) return;
        startInteraction(e, 'move');
      }}
      style={{
        position: 'absolute',
        left: `${widget.x}%`,
        top: `${widget.y}%`,
        width: `${widget.width}%`,
        height: `${widget.height}%`,
      }}
      className="z-10 cursor-grab active:cursor-grabbing group touch-none"
    >
      <div
        style={{ padding: `${cardPaddingPx}px` }}
        className="w-full h-full bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)] group-hover:bg-white/[0.12] group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_20px_rgba(94,225,217,0.04)] transition-all duration-300 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none rounded-xl" />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(widget.id);
          }}
          className="absolute top-1 left-1 p-1 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
          title="Remove widget"
        >
          <Trash2 size={12} />
        </button>
        {/* Settings Button */}
        <button 
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onConfigOpen(widget);
          }}
          className="absolute top-1 right-1 p-1 text-white/20 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
        >
          <Settings size={12} />
        </button>

        <div className="text-white/60 group-hover:text-white transition-colors">
          {renderedIcon}
        </div>
        <span
          style={{ fontSize: `${labelFontPx}px` }}
          className="font-bold uppercase tracking-[0.12em] whitespace-nowrap opacity-75 group-hover:opacity-100 text-center"
        >
          {widget.name}
        </span>

        {/* Resize Handle */}
        <motion.div
          onPointerDown={(e) => startInteraction(e, 'resize')}
          className="widget-resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white/40 rounded-br-sm" />
        </motion.div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const sessionIdRef = useRef(createSessionId());
  const [activeTab, setActiveTab] = useState<
    'layout' | 'wardrobe' | 'connection' | 'accounts'
  >('layout');
  const [widgets, setWidgets] = useState<Widget[]>(() => {
    if (typeof window === 'undefined') return hydrateWidgetsFromSnapshots(DEFAULT_WIDGET_SNAPSHOTS);
    return loadLayoutCache() ?? hydrateWidgetsFromSnapshots(DEFAULT_WIDGET_SNAPSHOTS);
  });
  const [httpSyncState, setHttpSyncState] = useState<HttpSyncState>('idle');
  const [customTemplateId, setCustomTemplateId] = useState(CUSTOM_WIDGET_TEMPLATES[0]?.id ?? 'sticky-note');
  const [activeTemplateCategory, setActiveTemplateCategory] = useState<'all' | WidgetTemplateCategory>('all');
  const mirrorRef = useRef<HTMLDivElement>(null);
  /** Local draft while the settings modal is open; committed to `widgets` + mirror only on Done. */
  const [widgetSettingsDraft, setWidgetSettingsDraft] = useState<Widget | null>(null);
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState<ClothingItemCreate>({
    name: '',
    category: 'shirt',
    color: '',
    season: '',
    notes: '',
  });
  const [wardrobeDragActive, setWardrobeDragActive] = useState(false);
  const wardrobeDragDepthRef = useRef(0);
  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window === 'undefined') return 'ws://localhost:8002/ws/control';
    try {
      return getMirrorWsUrl();
    } catch {
      return 'ws://localhost:8002/ws/control';
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [mirrorApiToken, setMirrorApiToken] = useState(() => getMirrorApiToken());
  const [wsConnected, setWsConnected] = useState(false);
  const connectionManagerRef = useRef<MirrorConnectionManager | null>(null);
  const [mirrorHttpBase, setMirrorHttpBase] = useState(() => {
    if (typeof window === 'undefined') return mirrorHttpFallbackFromWindow();
    try {
      // Prefer saved URL; else use env-aware default (production → https://mirror.smart-mirror.tech).
      // Do not use same-host :8002 when the app is served from Pages at smart-mirror.tech.
      return getMirrorHttpBase();
    } catch {
      return getMirrorHttpBase();
    }
  });
  const backendByWidgetIdRef = useRef<Map<string, WidgetConfigOut>>(new Map());
  const pushDebounceRef = useRef<number | undefined>(undefined);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const mirrorHttpRef = useRef(mirrorHttpBase);
  mirrorHttpRef.current = mirrorHttpBase;
  const [mirrorHttpDraft, setMirrorHttpDraft] = useState(mirrorHttpBase);
  const [wsUrlDraft, setWsUrlDraft] = useState(wsUrl);
  const [mirrorApiTokenDraft, setMirrorApiTokenDraft] = useState(mirrorApiToken);
  const [mirrorAuthList, setMirrorAuthList] = useState<MirrorAuthProviderStatus[]>([]);
  const remoteRefreshInFlightRef = useRef(false);
  const remoteRefreshTimerRef = useRef<number | undefined>(undefined);

  const filteredTemplates = useMemo(() => {
    if (activeTemplateCategory === 'all') return CUSTOM_WIDGET_TEMPLATES;
    return CUSTOM_WIDGET_TEMPLATES.filter((t) => t.category === activeTemplateCategory);
  }, [activeTemplateCategory]);
  const templateDropdownItems = useMemo(
    () => filteredTemplates.map((tmpl) => ({ id: tmpl.id, label: tmpl.label })),
    [filteredTemplates]
  );

  useEffect(() => {
    if (!filteredTemplates.some((t) => t.id === customTemplateId)) {
      setCustomTemplateId(filteredTemplates[0]?.id ?? CUSTOM_WIDGET_TEMPLATES[0]?.id ?? 'sticky-note');
    }
  }, [filteredTemplates, customTemplateId]);

  useEffect(() => {
    if (!showSettings) return;
    setMirrorHttpDraft(mirrorHttpBase);
    setWsUrlDraft(wsUrl);
    setMirrorApiTokenDraft(mirrorApiToken);
  }, [showSettings, mirrorApiToken, mirrorHttpBase, wsUrl]);

  const loadLayoutFromMirror = useCallback(async (opts?: { silent?: boolean }) => {
    const configuredBase = mirrorHttpBase.trim();
    if (!configuredBase) return;
    setHttpSyncState('pulling');
    const candidates = [configuredBase];
    const configuredHost = parseHost(configuredBase);
    const fallbackBase = mirrorHttpFallbackFromWindow();
    if (configuredHost && isLoopbackHost(configuredHost) && fallbackBase !== configuredBase) {
      candidates.push(fallbackBase);
    }
    try {
      let rows: WidgetConfigOut[] | null = null;
      let resolvedBase = configuredBase;
      for (const base of candidates) {
        try {
          rows = await mirrorGetWidgets(base);
          resolvedBase = base;
          break;
        } catch {
          // Try next candidate base before surfacing unreachable.
        }
      }
      if (!rows) throw new Error('all mirror API candidates failed');
      backendByWidgetIdRef.current = new Map(
        dedupeWidgetApiRows(rows).map((r) => [normalizeWidgetTypeId(r.widget_id), r])
      );
      const next = widgetsFromApi(rows);
      setWidgets(next);
      saveLayoutCache(next);
      if (resolvedBase !== configuredBase) {
        setMirrorHttpBase(resolvedBase);
        mirrorHttpRef.current = resolvedBase;
        persistMirrorHttpBase(resolvedBase);
      }
      if (!opts?.silent) toast.success('Loaded layout from mirror');
      setHttpSyncState('saved');
      window.setTimeout(() => setHttpSyncState('idle'), 2000);
    } catch (e) {
      console.warn('Mirror GET /api/widgets failed', e);
      const cached = loadLayoutCache();
      if (cached) {
        setWidgets(cached);
        if (!opts?.silent) toast.message('Mirror unreachable — showing saved layout from this browser');
      } else {
        toast.error('Could not load layout from mirror');
      }
      setHttpSyncState('error');
      window.setTimeout(() => setHttpSyncState('idle'), 3000);
    }
  }, [mirrorHttpBase]);

  useEffect(() => {
    void loadLayoutFromMirror({ silent: true });
  }, [loadLayoutFromMirror]);

  useEffect(() => {
    return () => {
      if (remoteRefreshTimerRef.current) {
        clearTimeout(remoteRefreshTimerRef.current);
      }
    };
  }, []);

  const loadMirrorAuth = useCallback(async () => {
    const base = mirrorHttpRef.current.trim();
    if (!base) return;
    try {
      const list = await mirrorAuthProviders(base);
      setMirrorAuthList(list);
    } catch {
      setMirrorAuthList([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'accounts') return;
    void loadMirrorAuth();
    const id = window.setInterval(() => {
      void loadMirrorAuth();
    }, 8000);
    return () => clearInterval(id);
  }, [activeTab, loadMirrorAuth]);

  const schedulePushLayoutToMirror = useCallback(
    (list: Widget[]) => {
      const base = mirrorHttpRef.current.trim();
      if (!base) return;
      if (pushDebounceRef.current) clearTimeout(pushDebounceRef.current);
      pushDebounceRef.current = window.setTimeout(async () => {
        setHttpSyncState('pushing');
        try {
          const payload = buildWidgetPutPayload(list, backendByWidgetIdRef.current);
          const out = await mirrorPutWidgets(base, payload);
          backendByWidgetIdRef.current = new Map(
            dedupeWidgetApiRows(out).map((r) => [normalizeWidgetTypeId(r.widget_id), r])
          );
          saveLayoutCache(list);
          setHttpSyncState('saved');
          window.setTimeout(() => setHttpSyncState('idle'), 2000);
        } catch {
          toast.error('Failed to save layout to mirror');
          setHttpSyncState('error');
          window.setTimeout(() => setHttpSyncState('idle'), 3000);
        }
      }, 220);
    },
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => saveLayoutCache(widgets), 400);
    return () => window.clearTimeout(t);
  }, [widgets]);

  // --- WebSocket via MirrorConnectionManager ---
  const messageHandlerRef = useRef<(data: Record<string, unknown>) => void>(() => {});
  messageHandlerRef.current = (data: Record<string, unknown>) => {
    const type = data.type as string | undefined;
    if (type === 'DEVICE_CONNECTED') { toast.success('Paired with mirror'); return; }
    if (type === 'DEVICE_ERROR') { toast.error(String((data.payload as Record<string, unknown>)?.message ?? 'Pairing failed')); return; }
    if (type === 'WIDGETS_SYNC_APPLIED') { toast.success('Mirror applied layout update'); }
    if (type === WIDGETS_REMOTE_UPDATED_EVENT) {
      if (remoteRefreshTimerRef.current) {
        clearTimeout(remoteRefreshTimerRef.current);
      }
      remoteRefreshTimerRef.current = window.setTimeout(() => {
        if (remoteRefreshInFlightRef.current) return;
        remoteRefreshInFlightRef.current = true;
        void loadLayoutFromMirror({ silent: true }).finally(() => {
          remoteRefreshInFlightRef.current = false;
        });
      }, 250);
    }
  };

  useEffect(() => {
    const mgr = new MirrorConnectionManager(
      {
        onStatusChange: (s) => setWsConnected(s === 'CONNECTED'),
        onMessage: (d) => messageHandlerRef.current(d),
      },
      wsUrl,
      mirrorApiToken,
    );
    connectionManagerRef.current = mgr;
    mgr.connect();
    return () => { mgr.dispose(); connectionManagerRef.current = null; };
  }, [mirrorApiToken, wsUrl]);

  const sendEnvelopeToMirror = (envelope: Record<string, unknown>) => {
    if (!connectionManagerRef.current?.send(envelope)) {
      toast.error('Mirror not connected');
    }
  };
  const { notifyWardrobeUpdated } = useWardrobeActions(
    sessionIdRef.current,
    sendEnvelopeToMirror,
  );

  const syncStateToMirror = useCallback((currentWidgets?: Widget[]) => {
    const widgetsToSync = currentWidgets ?? widgetsRef.current;
    const mgr = connectionManagerRef.current;
    sendEnvelopeToMirror(createWidgetsSyncEnvelope(mgr?.getSessionId() ?? sessionIdRef.current, widgetsToSync));
  }, []);

  // --- Clothing API sync (wardrobe uploads) ---
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const base = mirrorHttpBase.trim();
      if (!base) {
        if (!cancelled) setWardrobe([]);
        return;
      }
      try {
        const items = await listClothingItems(base, true);
        if (!cancelled) setWardrobe(items);
      } catch {
        if (!cancelled) setWardrobe([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mirrorHttpBase]);

  const openUploadModal = (file: File) => {
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setPendingUploadFile(file);
    setUploadMeta({
      name: baseName,
      category: 'shirt',
      color: '',
      season: '',
      notes: '',
    });
    setUploadModalOpen(true);
  };

  const beginClothingImageUpload = (file: File) => {
    const base = mirrorHttpBase.trim();
    if (!base) {
      toast.error('Set Mirror HTTP base before uploading');
      return;
    }
    if (!isImageFile(file)) {
      toast.error('Choose an image file to upload');
      return;
    }
    openUploadModal(file);
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    beginClothingImageUpload(file);
  };

  const resetWardrobeDropState = () => {
    wardrobeDragDepthRef.current = 0;
    setWardrobeDragActive(false);
  };

  const handleWardrobeDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    wardrobeDragDepthRef.current += 1;
    setWardrobeDragActive(true);
  };

  const handleWardrobeDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setWardrobeDragActive(true);
  };

  const handleWardrobeDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    wardrobeDragDepthRef.current = Math.max(0, wardrobeDragDepthRef.current - 1);
    if (wardrobeDragDepthRef.current === 0) {
      setWardrobeDragActive(false);
    }
  };

  const handleWardrobeDrop = (e: React.DragEvent<HTMLElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    resetWardrobeDropState();
    const file = Array.from<File>(e.dataTransfer.files).find(isImageFile);
    if (!file) {
      toast.error('Choose an image file to upload');
      return;
    }
    beginClothingImageUpload(file);
  };

  const commitUpload = async () => {
    const base = mirrorHttpBase.trim();
    const file = pendingUploadFile;
    if (!base || !file) return;
    const name = uploadMeta.name.trim();
    const category = uploadMeta.category.trim();
    if (!name || !category) {
      toast.error('Name and category are required');
      return;
    }

    setIsUploading(true);
    try {
      const item = await createClothingWithImage(base, file, {
        name,
        category,
        color: uploadMeta.color?.trim() || null,
        season: uploadMeta.season?.trim() || null,
        notes: uploadMeta.notes?.trim() || null,
      });
      setWardrobe((prev) => [item, ...prev]);
      toast.success('Item added to wardrobe');
      setUploadModalOpen(false);
      setPendingUploadFile(null);
      notifyWardrobeUpdated();
    } catch {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      const base = mirrorHttpBase.trim();
      if (!base) return;
      await deleteClothingItem(base, id);
      setWardrobe((prev) => prev.filter((item) => item.id !== id));
      toast.success('Item removed');
      notifyWardrobeUpdated();
    } catch {
      toast.error('Delete failed');
    }
  };

  // --- Widget Handlers ---
  const handleWidgetUpdate = (id: string, updates: Partial<Widget>) => {
    const updatedWidgets = widgets.map((w) => {
      if (w.id !== id) return w;
      const next = { ...w, ...updates };
      if (updates.width !== undefined || updates.height !== undefined) {
        next.sizePreset = inferWidgetSizePreset(next.width, next.height);
      }
      return next;
    });
    setWidgets(updatedWidgets);
    schedulePushLayoutToMirror(updatedWidgets);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updatedWidgets);
    }
  };

  const handleWidgetResizeCommit = (id: string, width: number, height: number) => {
    const preset = inferWidgetSizePreset(width, height);
    const dims = WIDGET_SIZE_PRESETS[preset];
    handleWidgetUpdate(id, { width: dims.width, height: dims.height, sizePreset: preset });
  };

  const patchWidgetSettingsDraftConfig = (config: Record<string, unknown>) => {
    setWidgetSettingsDraft((prev) => {
      if (!prev) return prev;
      const nextConfig = { ...prev.config, ...config };
      let name = prev.name;
      if (prev.type === 'custom' && typeof nextConfig.title === 'string') {
        const t = nextConfig.title.trim();
        name = t || 'Custom widget';
      } else {
        const base = standaloneTextWidgetBaseId(prev.id);
        if (base && typeof nextConfig.title === 'string') {
          const t = nextConfig.title.trim();
          name =
            t ||
            CUSTOM_WIDGET_TEMPLATES.find((x) => x.mirrorWidgetId === base)?.label ||
            prev.name;
        }
      }
      return { ...prev, config: nextConfig, name };
    });
  };

  const patchWidgetSettingsDraftSizePreset = (preset: WidgetSizePreset) => {
    setWidgetSettingsDraft((prev) => {
      if (!prev) return prev;
      const dims = WIDGET_SIZE_PRESETS[preset];
      return { ...prev, width: dims.width, height: dims.height, sizePreset: preset };
    });
  };

  const commitWidgetSettingsDraft = () => {
    if (!widgetSettingsDraft) return;
    const w = widgetSettingsDraft;
    const id = w.id;
    let name = w.name;
    const nextConfig = w.config;
    if (w.type === 'custom' && typeof nextConfig.title === 'string') {
      const t = nextConfig.title.trim();
      name = t || 'Custom widget';
    } else {
      const base = standaloneTextWidgetBaseId(w.id);
      if (base && typeof nextConfig.title === 'string') {
        const t = nextConfig.title.trim();
        name =
          t ||
          CUSTOM_WIDGET_TEMPLATES.find((x) => x.mirrorWidgetId === base)?.label ||
          w.name;
      }
    }
    const finalWidget: Widget = { ...w, name, config: { ...nextConfig } };
    const updatedWidgets = widgets.map((widget) => (widget.id === id ? finalWidget : widget));
    setWidgets(updatedWidgets);
    schedulePushLayoutToMirror(updatedWidgets);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updatedWidgets);
    }
    setWidgetSettingsDraft(null);
    toast.success('Widget settings saved');
  };

  const handleRemoveWidget = (id: string) => {
    const updated = widgets.filter((w) => w.id !== id);
    setWidgets(updated);
    schedulePushLayoutToMirror(updated);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updated);
    }
    if (widgetSettingsDraft?.id === id) setWidgetSettingsDraft(null);
    toast.success('Widget removed. Mirror UI picks up changes from the server after save.');
  };

  const addCustomWidgetFromTemplate = () => {
    const t =
      CUSTOM_WIDGET_TEMPLATES.find((x) => x.id === customTemplateId) ?? CUSTOM_WIDGET_TEMPLATES[0];
    if (!t) return;
    const id = t.mirrorWidgetId;
    const existing = widgets.find((w) => w.id === id);
    let config: Record<string, unknown>;
    let name = t.title ?? t.label;
    switch (t.kind) {
      case 'clock':
        name = 'Clock';
        config = { format: '24h', showSeconds: false };
        break;
      case 'weather':
        name = 'Weather';
        config = { location: 'San Francisco', unit: 'metric' };
        break;
      case 'calendar':
        name = 'Calendar';
        config = { view: 'month', showEvents: true, timeFormat: '24h' };
        break;
      case 'email':
        name = 'Email';
        config = { limit: 8, mode: 'unread_or_high' };
        break;
      case 'reminders':
        name = 'Reminders';
        config = { limit: 5, showCompleted: false };
        break;
      default:
        config = { title: t.title ?? '', text: t.text ?? '', templateId: t.id };
        break;
    }

    const widget: Widget = {
      id,
      type: 'builtin',
      name,
      icon: mirrorWidgetIcon(id),
      x: existing?.x ?? t.x,
      y: existing?.y ?? t.y,
      width: existing?.width ?? t.width,
      height: existing?.height ?? t.height,
      sizePreset: inferWidgetSizePreset(existing?.width ?? t.width, existing?.height ?? t.height),
      config,
    };
    const updated = existing ? widgets.map((w) => (w.id === id ? widget : w)) : [...widgets, widget];
    setWidgets(updated);
    schedulePushLayoutToMirror(updated);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updated);
    }
    toast.success(`Added “${t.label}”`);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-[var(--font-sans)] selection:bg-white/20 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[60%] h-[50%] bg-[radial-gradient(ellipse_at_20%_20%,rgba(94,225,217,0.06)_0%,transparent_70%)]" />
        <div className="absolute bottom-0 right-0 w-[50%] h-[40%] bg-[radial-gradient(ellipse_at_80%_80%,rgba(96,165,250,0.04)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
      </div>
      <div className="relative z-10">
      <Toaster theme="dark" position="top-center" />
      
      <header className="max-w-7xl mx-auto flex items-center justify-between mb-8 lg:mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
            <Shirt size={20} className="text-white/70" />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight font-[var(--font-display)]">Mirror Config</h1>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-white/35 font-medium">
              {wsConnected ? (
                <><Wifi size={10} className="text-emerald-400" /> Connected</>
              ) : (
                <><WifiOff size={10} className="text-red-400" /> Disconnected</>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2.5 text-white/30 hover:text-white/80 transition-colors rounded-xl hover:bg-white/[0.04]"
        >
          <Settings size={20} />
        </button>
      </header>

      <nav className="max-w-7xl mx-auto mb-6">
        <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm p-1 gap-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
          {[
            { id: 'layout', label: 'Layout' },
            { id: 'wardrobe', label: 'Wardrobe' },
            { id: 'accounts', label: 'Accounts' },
            { id: 'connection', label: 'Connection' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'px-4 py-2 rounded-full text-xs tracking-wide transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-white text-black font-medium shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-sm bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none rounded-3xl" />
              <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-medium font-[var(--font-display)]">Mirror Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-white/30 hover:text-white/80 transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    Mirror HTTP base (layout sync)
                  </label>
                  <input
                    type="text"
                    value={mirrorHttpDraft}
                    onChange={(e) => setMirrorHttpDraft(e.target.value)}
                    placeholder="http://192.168.1.50:8000"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                  <p className="text-[10px] text-white/20 leading-relaxed">
                    Same origin as the Pi FastAPI server (no trailing slash). Used for GET/PUT /api/widgets so
                    positions match the mirror UI. Clear this to use WebSocket-only layout sync.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">WebSocket URL</label>
                  <input 
                    type="text" 
                    value={wsUrlDraft}
                    onChange={(e) => setWsUrlDraft(e.target.value)}
                    placeholder="wss://..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                  <p className="text-[10px] text-white/20 leading-relaxed">
                    e.g. ws://192.168.1.100:8002/ws/control — optional if HTTP base is set (layout via REST).
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    Mirror API token
                  </label>
                  <input
                    type="password"
                    value={mirrorApiTokenDraft}
                    onChange={(e) => setMirrorApiTokenDraft(e.target.value)}
                    placeholder="Same value as MIRROR_API_TOKEN on mirror backend"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                  <p className="text-[10px] text-white/20 leading-relaxed">
                    Used for all /api requests and /ws/control auth.
                  </p>
                </div>
                
                <button 
                  type="button"
                  onClick={() => {
                    const v = mirrorHttpDraft.trim();
                    const nextWs = wsUrlDraft.trim();
                    const nextToken = mirrorApiTokenDraft.trim();
                    persistMirrorHttpBase(v);
                    if (nextWs) persistMirrorWsUrl(nextWs);
                    persistMirrorApiToken(nextToken);
                    setMirrorHttpBase(v);
                    if (nextWs) setWsUrl(nextWs);
                    setMirrorApiToken(nextToken);
                    setShowSettings(false);
                  }}
                  className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-white/90 transition-all active:scale-[0.98]"
                >
                  Save Configuration
                </button>
              </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setUploadModalOpen(false);
                setPendingUploadFile(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-sm bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none rounded-3xl" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-medium font-[var(--font-display)]">Clothing details</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadModalOpen(false);
                      setPendingUploadFile(null);
                    }}
                    className="text-white/30 hover:text-white/80 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-white/45">
                  Tag this item before the image is uploaded to the mirror wardrobe.
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Name *</label>
                  <input
                    type="text"
                    value={uploadMeta.name}
                    onChange={(e) => setUploadMeta((m) => ({ ...m, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Category *</label>
                  <FluidDropdown
                    items={CLOTHING_CATEGORY_ITEMS}
                    value={uploadMeta.category}
                    onChange={(category) => setUploadMeta((m) => ({ ...m, category }))}
                    className="max-w-none"
                    buttonClassName="h-14 px-5 text-base font-semibold bg-white/5 border-white/10"
                    menuClassName="max-h-48 overflow-y-auto"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Color</label>
                  <input
                    type="text"
                    value={uploadMeta.color ?? ''}
                    onChange={(e) => setUploadMeta((m) => ({ ...m, color: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Season</label>
                  <input
                    type="text"
                    value={uploadMeta.season ?? ''}
                    onChange={(e) => setUploadMeta((m) => ({ ...m, season: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Notes</label>
                  <textarea
                    value={uploadMeta.notes ?? ''}
                    onChange={(e) => setUploadMeta((m) => ({ ...m, notes: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm min-h-[72px]"
                    placeholder="Optional"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void commitUpload()}
                  disabled={isUploading}
                  className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-white/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                  Upload
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Widget Config Modal */}
      <AnimatePresence>
        {widgetSettingsDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setWidgetSettingsDraft(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-sm bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none rounded-3xl" />
              <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="text-white/50">{widgetSettingsDraft.icon}</div>
                  <h3 className="text-xl font-medium font-[var(--font-display)]">{widgetSettingsDraft.name} Settings</h3>
                </div>
                <button onClick={() => setWidgetSettingsDraft(null)} className="text-white/30 hover:text-white/80 transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Widget Size</label>
                  <FluidDropdown
                    items={SIZE_DROPDOWN_ITEMS}
                    value={widgetSettingsDraft.sizePreset ?? inferWidgetSizePreset(widgetSettingsDraft.width, widgetSettingsDraft.height)}
                    onChange={(preset) => patchWidgetSettingsDraftSizePreset(preset)}
                    className="max-w-none"
                  />
                </div>
                {widgetSettingsDraft.id === 'clock' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Time Format</label>
                      <FluidDropdown
                        items={[...CLOCK_FORMAT_ITEMS]}
                        value={String(widgetSettingsDraft.config.format ?? '24h') as '12h' | '24h'}
                        onChange={(value) => patchWidgetSettingsDraftConfig({ format: value })}
                        className="max-w-none"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Show Seconds</span>
                      <button 
                        type="button"
                        onClick={() =>
                          patchWidgetSettingsDraftConfig({ showSeconds: !widgetSettingsDraft.config.showSeconds })
                        }
                        className={cn(
                          "w-10 h-5 rounded-full transition-colors relative",
                          widgetSettingsDraft.config.showSeconds ? "bg-white" : "bg-white/10"
                        )}
                      >
                        <motion.div 
                          animate={{ x: widgetSettingsDraft.config.showSeconds ? 20 : 2 }}
                          className={cn("absolute top-1 w-3 h-3 rounded-full", widgetSettingsDraft.config.showSeconds ? "bg-black" : "bg-white/40")} 
                        />
                      </button>
                    </div>
                  </>
                )}

                {widgetSettingsDraft.id === 'weather' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Location</label>
                      <input 
                        type="text" 
                        value={String(widgetSettingsDraft.config.location ?? '')}
                        onChange={(e) => patchWidgetSettingsDraftConfig({ location: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Unit</label>
                      <FluidDropdown
                        items={[...WEATHER_UNIT_ITEMS]}
                        value={String(widgetSettingsDraft.config.unit ?? 'metric') as 'metric' | 'imperial'}
                        onChange={(value) => patchWidgetSettingsDraftConfig({ unit: value })}
                        className="max-w-none"
                      />
                    </div>
                  </>
                )}

                {widgetSettingsDraft.id === 'calendar' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">View Mode</label>
                      <FluidDropdown
                        items={[...CALENDAR_VIEW_ITEMS]}
                        value={String(widgetSettingsDraft.config.view ?? 'month') as 'day' | 'week' | 'month'}
                        onChange={(value) => patchWidgetSettingsDraftConfig({ view: value })}
                        className="max-w-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Time Format</label>
                      <FluidDropdown
                        items={[...CALENDAR_TIME_FORMAT_ITEMS]}
                        value={String(widgetSettingsDraft.config.timeFormat ?? '24h') as '12h' | '24h'}
                        onChange={(value) => patchWidgetSettingsDraftConfig({ timeFormat: value })}
                        className="max-w-none"
                      />
                    </div>
                  </>
                )}

                {mirrorWidgetBaseId(widgetSettingsDraft.id) === 'reminders' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Item Limit</label>
                      <input 
                        type="number" 
                        value={Number(widgetSettingsDraft.config.limit ?? 5)}
                        onChange={(e) =>
                          patchWidgetSettingsDraftConfig({ limit: parseInt(e.target.value, 10) })
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                  </>
                )}

                {(widgetSettingsDraft.type === 'custom' ||
                  standaloneTextWidgetBaseId(widgetSettingsDraft.id)) && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Title</label>
                      <input
                        type="text"
                        value={String(widgetSettingsDraft.config.title ?? widgetSettingsDraft.name)}
                        onChange={(e) =>
                          patchWidgetSettingsDraftConfig({
                            title: e.target.value,
                            text: widgetSettingsDraft.config.text ?? '',
                          })
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Body text</label>
                      <textarea
                        value={String(widgetSettingsDraft.config.text ?? '')}
                        onChange={(e) =>
                          patchWidgetSettingsDraftConfig({
                            title: String(widgetSettingsDraft.config.title ?? widgetSettingsDraft.name),
                            text: e.target.value,
                          })
                        }
                        className="w-full min-h-[100px] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                  </>
                )}
                
                <button 
                  type="button"
                  onClick={commitWidgetSettingsDraft}
                  className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-white/90 transition-all active:scale-[0.98]"
                >
                  Done
                </button>
              </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto pb-32">
        {activeTab === 'accounts' ? (
          <section className="max-w-xl mx-auto px-4 space-y-8">
            <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">
              Calendar accounts
            </h2>
            <p className="text-sm text-white/45">
              Use the same HTTP base as in Settings. The mirror stores tokens; widgets read calendar and tasks from the mirror API.
            </p>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-medium text-white/90">Sign in on the mirror (QR)</h3>
              <p className="text-xs text-white/40">
                Starts device login. Your mirror will show a QR code and code — complete sign-in on your phone.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  className="flex-1 bg-white/10 border border-white/15 rounded-xl py-3 text-sm hover:bg-white/15 transition-colors"
                  onClick={async () => {
                    try {
                      await mirrorAuthStartDeviceLogin(mirrorHttpBase, 'google');
                      toast.success('Check the mirror for a QR code.');
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Failed to start Google login');
                    }
                  }}
                >
                  Google (QR on mirror)
                </button>
              </div>
            </GlassCard>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-medium text-white/90">Sign in on this device</h3>
              <p className="text-xs text-white/40">
                Opens your browser to Google, then returns to the mirror. Use when you prefer not to use the mirror screen.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 bg-white text-black rounded-xl py-3 text-sm font-medium hover:bg-white/90 transition-colors"
                  onClick={() => {
                    window.location.href = mirrorOAuthWebStartUrl(mirrorHttpBase, 'google');
                  }}
                >
                  Google in browser
                </button>
              </div>
            </GlassCard>

            <GlassCard className="space-y-3">
              <h3 className="text-sm font-medium text-white/90">Status</h3>
              {mirrorAuthList.length === 0 ? (
                <p className="text-xs text-white/35">Could not load status. Check mirror HTTP base in Settings.</p>
              ) : (
                <ul className="space-y-2">
                  {mirrorAuthList.map((row) => (
                    <li
                      key={row.provider}
                      className="flex items-center justify-between gap-3 text-sm border border-white/10 rounded-xl px-3 py-2"
                    >
                      <span className="capitalize">{row.provider}</span>
                      <span className={row.connected ? 'text-emerald-400' : 'text-white/40'}>
                        {row.connected ? 'Connected' : 'Not connected'}
                      </span>
                      {row.connected && (
                        <button
                          type="button"
                          className="text-xs text-red-300 hover:text-red-200"
                          onClick={async () => {
                            try {
                              await mirrorAuthLogout(mirrorHttpBase, row.provider);
                              toast.success('Disconnected');
                              void loadMirrorAuth();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Disconnect failed');
                            }
                          }}
                        >
                          Disconnect
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </section>
        ) : activeTab === 'layout' ? (
          <section className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Mirror Screen</h2>
              <div className="flex flex-wrap items-center gap-2">
                <FluidDropdown
                  items={TEMPLATE_CATEGORY_ITEMS}
                  value={activeTemplateCategory}
                  onChange={(value) => setActiveTemplateCategory(value as 'all' | WidgetTemplateCategory)}
                  className="max-w-[180px]"
                  buttonClassName="h-8 text-[10px]"
                />
                <FluidDropdown
                  items={templateDropdownItems}
                  value={customTemplateId}
                  onChange={setCustomTemplateId}
                  className="max-w-[200px]"
                  buttonClassName="h-8 text-[10px]"
                />
                <button
                  type="button"
                  onClick={addCustomWidgetFromTemplate}
                  className="text-[10px] px-2 py-1 border border-white/20 rounded-lg text-white/60 hover:text-white hover:border-white/40 transition-colors"
                >
                  Add widget
                </button>
                <button
                  type="button"
                  disabled={!mirrorHttpBase.trim() || httpSyncState === 'pulling' || httpSyncState === 'pushing'}
                  onClick={() => void loadLayoutFromMirror({ silent: false })}
                  className={cn(
                    'flex items-center gap-1.5 text-[10px] px-2 py-1 border rounded-lg transition-colors',
                    mirrorHttpBase.trim() && httpSyncState !== 'pulling' && httpSyncState !== 'pushing'
                      ? 'border-white/20 text-white/60 hover:text-white hover:border-white/40'
                      : 'border-white/5 text-white/25 cursor-not-allowed'
                  )}
                >
                  {httpSyncState === 'pulling' || httpSyncState === 'pushing' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {layoutSyncLabel(mirrorHttpBase, httpSyncState)}
                </button>
                <p className="text-[10px] text-white/20 w-full sm:w-auto">Drag to position</p>
              </div>
            </div>
            
            <div 
              ref={mirrorRef}
              className="relative w-full aspect-[9/16] bg-black border border-white/[0.08] rounded-[2.5rem] overflow-hidden group mx-auto max-w-[460px] shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />
              <div className="absolute top-0 left-[15%] w-[40%] h-[30%] bg-[radial-gradient(ellipse,rgba(94,225,217,0.04)_0%,transparent_70%)] pointer-events-none" />
              
              {widgets.map((widget) => (
                <MirrorWidget 
                  key={widget.id} 
                  widget={widget} 
                  containerRef={mirrorRef}
                  onUpdate={handleWidgetUpdate}
                  onResizeCommit={handleWidgetResizeCommit}
                  onConfigOpen={(w) => setWidgetSettingsDraft(cloneWidgetForSettingsDraft(w))}
                  onRemove={handleRemoveWidget}
                />
              ))}

              {/* Mirror Frame Inner Shadow */}
              <div className="absolute inset-0 rounded-[2.5rem] shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] pointer-events-none" />
            </div>
          </section>
        ) : activeTab === 'wardrobe' ? (
            <section
              aria-label="Wardrobe upload drop zone"
              onDragEnter={handleWardrobeDragEnter}
              onDragOver={handleWardrobeDragOver}
              onDragLeave={handleWardrobeDragLeave}
              onDrop={handleWardrobeDrop}
              className={cn(
                'relative max-w-5xl mx-auto rounded-2xl transition-all duration-200',
                wardrobeDragActive ? 'ring-2 ring-white/30 bg-white/[0.03]' : ''
              )}
            >
              {wardrobeDragActive && (
                <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-white/30 bg-black/45 backdrop-blur-[2px]" />
              )}
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Wardrobe</h2>
                <label className="cursor-pointer text-white/40 hover:text-white transition-colors flex items-center gap-2 text-xs">
                  <span className="hidden sm:inline">Upload Item</span>
                  <Upload size={18} />
                  <input type="file" className="hidden" onChange={handleFileChosen} accept="image/*" />
                </label>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {isUploading && (
                  <GlassCard className="flex items-center justify-center aspect-square">
                    <Loader2 className="animate-spin text-white/40" />
                  </GlassCard>
                )}
                {wardrobe.map((item) => (
                  <motion.div 
                    layout
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group"
                  >
                    <GlassCard className="p-0 overflow-hidden aspect-square">
                      <img 
                        src={primaryImageUrl(item) ?? ''} 
                        alt={item.name}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                        <p className="text-[10px] font-medium truncate">{item.name}</p>
                      </div>
                    </GlassCard>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </div>
              
              {wardrobe.length === 0 && !isUploading && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl">
                  <p className="text-white/20 text-sm font-light">
                    No wardrobe items yet. Upload an item to add it to your mirror wardrobe.
                  </p>
                </div>
              )}
            </section>
        ) : (
              <section className="max-w-2xl mx-auto">
                <GlassCard className="space-y-3">
                  <h3 className="text-lg font-light">Connection Diagnostics</h3>
                  <p className="text-sm text-white/50">WebSocket: {wsUrl}</p>
                  <p className="text-sm text-white/50">HTTP: {mirrorHttpBase || 'not configured'}</p>
                  <p className="text-sm text-white/50">
                    Status: {wsConnected ? 'connected' : 'disconnected'}
                  </p>
                </GlassCard>
              </section>
        )}
      </main>

      {/* Bottom Nav / Status */}
      <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-center lg:justify-end">
          <div className="px-5 py-2.5 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.06] rounded-full flex items-center gap-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
             <div className="flex items-center gap-2">
               <div className={cn("w-1.5 h-1.5 rounded-full", wsConnected ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-red-400")} />
               <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/50">Mirror Sync</span>
             </div>
             <div className="w-px h-3 bg-white/[0.06]" />
             <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/25">
               Mobile Companion
             </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
