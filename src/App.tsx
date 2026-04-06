import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Clock, 
  Cloud, 
  Calendar, 
  ListTodo, 
  Camera, 
  Shirt, 
  Upload, 
  GripVertical, 
  X,
  Check,
  Loader2,
  Settings,
  Wifi,
  WifiOff,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
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
import { mirrorGetWidgets, mirrorPutWidgets } from './lib/mirrorApi';
import { WidgetSummaryPanel, type HttpSyncState } from './components/WidgetSummaryPanel';
import { CUSTOM_WIDGET_TEMPLATES, standaloneTextWidgetBaseId } from './lib/customWidgetTemplates';
import type { WidgetConfigOut } from './types/mirror';

const MIRROR_HTTP_STORAGE_KEY = 'mirror_http_base';

interface WardrobeItem {
  id: string;
  name: string;
  imageUrl: string;
  category?: string;
}

// --- Components ---

const GlassCard = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn(
      "bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 transition-colors duration-300 hover:bg-white/10",
      className
    )}
  >
    {children}
  </div>
);

const MirrorWidget = ({
  widget,
  onUpdate,
  onConfigOpen,
  onRemove,
  containerRef
}: {
  widget: Widget;
  onUpdate: (id: string, updates: Partial<Widget>) => void;
  onConfigOpen: (widget: Widget) => void;
  onRemove: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
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
    [clearInteraction, containerRef, onUpdate, widget.height, widget.id, widget.width, widget.x, widget.y]
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
        className="w-full h-full bg-white/10 backdrop-blur-md border border-white/20 rounded-xl flex flex-col items-center justify-center gap-2 shadow-2xl group-hover:bg-white/20 transition-colors relative overflow-hidden"
      >
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
  // Dev mode: bypass Google sign-in for local mirror configuration tests.
  // Wardrobe (Firestore/Storage) remains disabled unless you wire auth back in.
  const userId = "local-dev";
  const enableWardrobe = false;
  const [widgets, setWidgets] = useState<Widget[]>(() => {
    if (typeof window === 'undefined') return hydrateWidgetsFromSnapshots(DEFAULT_WIDGET_SNAPSHOTS);
    return loadLayoutCache() ?? hydrateWidgetsFromSnapshots(DEFAULT_WIDGET_SNAPSHOTS);
  });
  const [httpSyncState, setHttpSyncState] = useState<HttpSyncState>('idle');
  const [customTemplateId, setCustomTemplateId] = useState(CUSTOM_WIDGET_TEMPLATES[0]?.id ?? 'sticky-note');
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [activeWidgetConfig, setActiveWidgetConfig] = useState<Widget | null>(null);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window === 'undefined') return 'ws://localhost:8002/ws/control';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.hostname}:8002/ws/control`;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const [mirrorHttpBase, setMirrorHttpBase] = useState(() => {
    if (typeof window === 'undefined') return 'http://127.0.0.1:8002';
    try {
      return localStorage.getItem(MIRROR_HTTP_STORAGE_KEY) ?? 'http://127.0.0.1:8002';
    } catch {
      return 'http://127.0.0.1:8002';
    }
  });
  const backendByWidgetIdRef = useRef<Map<string, WidgetConfigOut>>(new Map());
  const pushDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const mirrorHttpRef = useRef(mirrorHttpBase);
  mirrorHttpRef.current = mirrorHttpBase;
  const [mirrorHttpDraft, setMirrorHttpDraft] = useState(mirrorHttpBase);

  useEffect(() => {
    if (showSettings) setMirrorHttpDraft(mirrorHttpBase);
  }, [showSettings, mirrorHttpBase]);

  const loadLayoutFromMirror = useCallback(async (opts?: { silent?: boolean }) => {
    const base = mirrorHttpBase.trim();
    if (!base) return;
    setHttpSyncState('pulling');
    try {
      const rows = await mirrorGetWidgets(base);
      backendByWidgetIdRef.current = new Map(
        dedupeWidgetApiRows(rows).map((r) => [normalizeWidgetTypeId(r.widget_id), r])
      );
      const next = widgetsFromApi(rows);
      setWidgets(next);
      saveLayoutCache(next);
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

  const schedulePushLayoutToMirror = useCallback(
    (list: Widget[]) => {
      const base = mirrorHttpRef.current.trim();
      if (!base) return;
      if (pushDebounceRef.current) clearTimeout(pushDebounceRef.current);
      pushDebounceRef.current = setTimeout(async () => {
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
      }, 500);
    },
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => saveLayoutCache(widgets), 400);
    return () => window.clearTimeout(t);
  }, [widgets]);

  // --- WebSocket (actions like capture; layout uses HTTP when mirror HTTP base is set) ---
  useEffect(() => {
    const connectWs = () => {
      if (socketRef.current) socketRef.current.close();

      try {
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          setWsConnected(true);
          toast.success('Connected to Mirror');
          if (!mirrorHttpRef.current.trim()) {
            const w = widgetsRef.current;
            socket.send(
              JSON.stringify({
                type: 'SYNC_STATE',
                widgets: w.map((wi) => ({
                  id: wi.id,
                  type: wi.type || 'builtin',
                  name: wi.name,
                  x: wi.x,
                  y: wi.y,
                  width: wi.width,
                  height: wi.height,
                  config: wi.config || {},
                })),
                action: { kind: 'INITIAL_SYNC' },
                meta: { source: 'config-app', ts: new Date().toISOString() },
              })
            );
          }
        };

        socket.onclose = () => {
          setWsConnected(false);
          if (socketRef.current === socket) {
            setTimeout(connectWs, 5000);
          }
        };

        socket.onerror = () => {
          setWsConnected(false);
        };

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log('Received from Mirror:', data);
          if (data.type === 'CAPTURE_COMPLETE') {
            toast.success('Photo captured!');
          }
          if (data.type === 'SYNC_APPLIED') {
            toast.success('Mirror applied layout');
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();
    return () => {
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [wsUrl]);

  const sendToMirror = (type: string, payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, ...payload }));
    } else {
      toast.error('Mirror not connected');
    }
  };

  const syncStateToMirror = useCallback((currentWidgets?: Widget[], action?: Record<string, unknown> | null) => {
    const widgetsToSync = currentWidgets ?? widgetsRef.current;
    sendToMirror('SYNC_STATE', {
      widgets: widgetsToSync.map((w) => ({
        id: w.id,
        type: w.type || 'builtin',
        name: w.name,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        config: w.config || {},
      })),
      action: action ?? null,
      meta: {
        source: 'config-app',
        ts: new Date().toISOString(),
      },
    });
  }, []);

  // --- Wardrobe Sync ---
  useEffect(() => {
    if (!enableWardrobe) {
      setWardrobe([]);
      return;
    }

    // NOTE: Wardrobe requires authenticated access (Firestore rules).
    // This dev-mode implementation intentionally disables it.
  }, [enableWardrobe]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!enableWardrobe) {
      toast.error("Wardrobe disabled in dev mode (requires Google auth).");
      return;
    }

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `wardrobe/${userId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      await addDoc(collection(db, 'wardrobe'), {
        name: file.name.split('.')[0],
        imageUrl: url,
        userId: userId,
        createdAt: serverTimestamp()
      });
      toast.success("Item added to wardrobe");
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      if (!enableWardrobe) return;
      await deleteDoc(doc(db, 'wardrobe', id));
      toast.success("Item removed");
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  // --- Widget Handlers ---
  const handleWidgetUpdate = (id: string, updates: Partial<Widget>) => {
    const updatedWidgets = widgets.map((w) => (w.id === id ? { ...w, ...updates } : w));
    setWidgets(updatedWidgets);
    schedulePushLayoutToMirror(updatedWidgets);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updatedWidgets);
    }
  };

  const handleWidgetConfigUpdate = (id: string, config: Record<string, unknown>) => {
    const updatedWidgets = widgets.map((w) => {
      if (w.id !== id) return w;
      const nextConfig = { ...w.config, ...config };
      let name = w.name;
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
      return { ...w, config: nextConfig, name };
    });
    setWidgets(updatedWidgets);

    const updatedWidget = updatedWidgets.find((w) => w.id === id);
    if (updatedWidget) {
      schedulePushLayoutToMirror(updatedWidgets);
      if (!mirrorHttpBase.trim()) {
        syncStateToMirror(updatedWidgets, {
          kind: 'UPDATE_WIDGET_CONFIG',
          id: updatedWidget.id,
        });
      }

      if (activeWidgetConfig?.id === id) {
        setActiveWidgetConfig(updatedWidget);
      }
    }
    toast.success('Widget config updated');
  };

  const handleRemoveWidget = (id: string) => {
    const updated = widgets.filter((w) => w.id !== id);
    setWidgets(updated);
    schedulePushLayoutToMirror(updated);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updated);
    }
    if (activeWidgetConfig?.id === id) setActiveWidgetConfig(null);
    toast.success('Widget removed. Mirror UI picks up changes from the server after save.');
  };

  const addCustomWidgetFromTemplate = () => {
    const t =
      CUSTOM_WIDGET_TEMPLATES.find((x) => x.id === customTemplateId) ?? CUSTOM_WIDGET_TEMPLATES[0];
    if (!t) return;
    const id = t.mirrorWidgetId;
    const existing = widgets.find((w) => w.id === id);
    const widget: Widget =
      t.kind === 'reminders'
        ? {
            id,
            type: 'builtin',
            name: 'Reminders',
            icon: mirrorWidgetIcon(id),
            x: existing?.x ?? t.x,
            y: existing?.y ?? t.y,
            width: existing?.width ?? t.width,
            height: existing?.height ?? t.height,
            config: { limit: 5, showCompleted: false },
          }
        : {
            id,
            type: 'builtin',
            name: t.title ?? t.label,
            icon: mirrorWidgetIcon(id),
            x: existing?.x ?? t.x,
            y: existing?.y ?? t.y,
            width: existing?.width ?? t.width,
            height: existing?.height ?? t.height,
            config: { title: t.title ?? '', text: t.text ?? '', templateId: t.id },
          };
    const updated = existing ? widgets.map((w) => (w.id === id ? widget : w)) : [...widgets, widget];
    setWidgets(updated);
    schedulePushLayoutToMirror(updated);
    if (!mirrorHttpBase.trim()) {
      syncStateToMirror(updated);
    }
    toast.success(`Added “${t.label}”`);
  };

  // --- Camera Trigger ---
  const triggerCapture = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval);
          syncStateToMirror(widgetsRef.current, { kind: 'TRIGGER_CAPTURE' });
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans selection:bg-white/20">
      <Toaster theme="dark" position="top-center" />
      
      {/* Header */}
      <header className="max-w-7xl mx-auto flex items-center justify-between mb-8 lg:mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <Shirt size={20} />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight">Mirror Config</h1>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
              {wsConnected ? (
                <><Wifi size={10} className="text-green-500" /> Connected</>
              ) : (
                <><WifiOff size={10} className="text-red-500" /> Disconnected</>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 text-white/40 hover:text-white transition-colors"
        >
          <Settings size={20} />
        </button>
      </header>

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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-medium">Mirror Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white">
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
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="wss://..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                  <p className="text-[10px] text-white/20 leading-relaxed">
                    e.g. ws://192.168.1.100:8002/ws/control — optional if HTTP base is set (layout via REST).
                  </p>
                </div>
                
                <button 
                  type="button"
                  onClick={() => {
                    const v = mirrorHttpDraft.trim();
                    try {
                      localStorage.setItem(MIRROR_HTTP_STORAGE_KEY, v);
                    } catch {
                      /* ignore */
                    }
                    setMirrorHttpBase(v);
                    setShowSettings(false);
                  }}
                  className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-white/90 transition-all"
                >
                  Save Configuration
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Widget Config Modal */}
      <AnimatePresence>
        {activeWidgetConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveWidgetConfig(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="text-white/60">{activeWidgetConfig.icon}</div>
                  <h3 className="text-xl font-medium">{activeWidgetConfig.name} Settings</h3>
                </div>
                <button onClick={() => setActiveWidgetConfig(null)} className="text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                {activeWidgetConfig.id === 'clock' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Time Format</label>
                      <select 
                        value={activeWidgetConfig.config.format}
                        onChange={(e) => handleWidgetConfigUpdate(activeWidgetConfig.id, { format: e.target.value })}
                        className="companion-select w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                      >
                        <option value="12h">12-hour</option>
                        <option value="24h">24-hour</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Show Seconds</span>
                      <button 
                        onClick={() => handleWidgetConfigUpdate(activeWidgetConfig.id, { showSeconds: !activeWidgetConfig.config.showSeconds })}
                        className={cn(
                          "w-10 h-5 rounded-full transition-colors relative",
                          activeWidgetConfig.config.showSeconds ? "bg-white" : "bg-white/10"
                        )}
                      >
                        <motion.div 
                          animate={{ x: activeWidgetConfig.config.showSeconds ? 20 : 2 }}
                          className={cn("absolute top-1 w-3 h-3 rounded-full", activeWidgetConfig.config.showSeconds ? "bg-black" : "bg-white/40")} 
                        />
                      </button>
                    </div>
                  </>
                )}

                {activeWidgetConfig.id === 'weather' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Location</label>
                      <input 
                        type="text" 
                        value={activeWidgetConfig.config.location}
                        onChange={(e) => handleWidgetConfigUpdate(activeWidgetConfig.id, { location: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Unit</label>
                      <select 
                        value={activeWidgetConfig.config.unit}
                        onChange={(e) => handleWidgetConfigUpdate(activeWidgetConfig.id, { unit: e.target.value })}
                        className="companion-select w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                      >
                        <option value="metric">Metric (°C)</option>
                        <option value="imperial">Imperial (°F)</option>
                      </select>
                    </div>
                  </>
                )}

                {activeWidgetConfig.id === 'calendar' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">View Mode</label>
                      <select 
                        value={activeWidgetConfig.config.view}
                        onChange={(e) => handleWidgetConfigUpdate(activeWidgetConfig.id, { view: e.target.value })}
                        className="companion-select w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                      >
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                      </select>
                    </div>
                  </>
                )}

                {mirrorWidgetBaseId(activeWidgetConfig.id) === 'reminders' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Item Limit</label>
                      <input 
                        type="number" 
                        value={Number(activeWidgetConfig.config.limit ?? 5)}
                        onChange={(e) => handleWidgetConfigUpdate(activeWidgetConfig.id, { limit: parseInt(e.target.value, 10) })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                  </>
                )}

                {(activeWidgetConfig.type === 'custom' ||
                  standaloneTextWidgetBaseId(activeWidgetConfig.id)) && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Title</label>
                      <input
                        type="text"
                        value={String(activeWidgetConfig.config.title ?? activeWidgetConfig.name)}
                        onChange={(e) =>
                          handleWidgetConfigUpdate(activeWidgetConfig.id, {
                            title: e.target.value,
                            text: activeWidgetConfig.config.text ?? '',
                          })
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Body text</label>
                      <textarea
                        value={String(activeWidgetConfig.config.text ?? '')}
                        onChange={(e) =>
                          handleWidgetConfigUpdate(activeWidgetConfig.id, {
                            title: String(activeWidgetConfig.config.title ?? activeWidgetConfig.name),
                            text: e.target.value,
                          })
                        }
                        className="w-full min-h-[100px] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                  </>
                )}
                
                <button 
                  onClick={() => setActiveWidgetConfig(null)}
                  className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-white/90 transition-all"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Mirror Canvas */}
          <section className="lg:col-span-5 xl:col-span-4">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Mirror Screen</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={customTemplateId}
                  onChange={(e) => setCustomTemplateId(e.target.value)}
                  className="companion-select text-[10px] rounded-lg px-2 py-1 max-w-[200px] border focus:outline-none focus:border-zinc-500"
                >
                  {CUSTOM_WIDGET_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addCustomWidgetFromTemplate}
                  className="text-[10px] px-2 py-1 border border-white/20 rounded-lg text-white/60 hover:text-white hover:border-white/40 transition-colors"
                >
                  Add widget
                </button>
                <p className="text-[10px] text-white/20 w-full sm:w-auto">Drag to position</p>
              </div>
            </div>
            
            <div 
              ref={mirrorRef}
              className="relative w-full aspect-[9/16] bg-zinc-950 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-inner group mx-auto max-w-[400px] lg:max-w-none"
            >
              {/* Mirror Surface Reflection Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] pointer-events-none" />
              
              {widgets.map((widget) => (
                <MirrorWidget 
                  key={widget.id} 
                  widget={widget} 
                  containerRef={mirrorRef}
                  onUpdate={handleWidgetUpdate}
                  onConfigOpen={(w) => setActiveWidgetConfig(w)}
                  onRemove={handleRemoveWidget}
                />
              ))}

              {/* Mirror Frame Inner Shadow */}
              <div className="absolute inset-0 rounded-[2.5rem] shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] pointer-events-none" />
            </div>
          </section>

          {/* Right Column: Controls & Wardrobe */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-12">
            <WidgetSummaryPanel
              widgets={widgets}
              mirrorHttpBase={mirrorHttpBase}
              httpSyncState={httpSyncState}
              onRefreshFromMirror={() => void loadLayoutFromMirror({ silent: false })}
              onRemoveWidget={handleRemoveWidget}
            />
            {/* Camera Section */}
            <section>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Camera</h2>
              </div>
              <GlassCard className="flex flex-col md:flex-row items-center justify-center gap-8 py-8 px-12">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-2 border-white/10 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {countdown ? (
                        <motion.span 
                          key={countdown}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 1.5, opacity: 0 }}
                          className="text-4xl font-light"
                        >
                          {countdown}
                        </motion.span>
                      ) : (
                        <Camera size={32} className="text-white/60" />
                      )}
                    </AnimatePresence>
                  </div>
                  {countdown && (
                    <motion.div 
                      className="absolute inset-0 border-2 border-white rounded-full"
                      initial={{ pathLength: 1 }}
                      animate={{ pathLength: 0 }}
                      transition={{ duration: 3, ease: "linear" }}
                    />
                  )}
                </div>
                <div className="flex flex-col items-center md:items-start gap-2">
                  <h3 className="text-lg font-light">Pose Capture</h3>
                  <p className="text-xs text-white/40 mb-2">Trigger the mirror's camera for a quick snapshot.</p>
                  <button 
                    onClick={triggerCapture}
                    disabled={!!countdown}
                    className="bg-white text-black px-10 py-3 rounded-full font-medium hover:bg-white/90 transition-all disabled:opacity-50 active:scale-95"
                  >
                    Capture Pose
                  </button>
                </div>
              </GlassCard>
            </section>

            {/* Wardrobe Section */}
            <section>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Wardrobe</h2>
                <label className="cursor-pointer text-white/40 hover:text-white transition-colors flex items-center gap-2 text-xs">
                  <span className="hidden sm:inline">Upload Item</span>
                  <Upload size={18} />
                  <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
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
                    <GlassCard 
                      onClick={() =>
                        syncStateToMirror(widgetsRef.current, {
                          kind: 'SELECT_CLOTHING',
                          imageUrl: item.imageUrl,
                        })
                      }
                      className="p-0 overflow-hidden aspect-square cursor-pointer"
                    >
                      <img 
                        src={item.imageUrl} 
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
                    Wardrobe disabled in dev mode (requires Google auth)
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Bottom Nav / Status */}
      <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black via-black to-transparent z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-center lg:justify-end">
          <div className="px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-4">
             <div className="flex items-center gap-2">
               <div className={cn("w-1.5 h-1.5 rounded-full", wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
               <span className="text-[10px] uppercase tracking-widest font-bold text-white/60">Mirror Sync</span>
             </div>
             <div className="w-px h-3 bg-white/10" />
             <span className="text-[10px] uppercase tracking-widest font-bold text-white/30">
               Dev Mode (No Auth)
             </span>
          </div>
        </div>
      </div>
    </div>
  );
}
