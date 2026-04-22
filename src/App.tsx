import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { User } from 'firebase/auth';
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
  LogOut,
  Settings,
  Sparkles,
  Wifi,
  WifiOff,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { cn } from './lib/utils';
import { ApiError } from './api/httpClient';
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
import { clearLayoutCache, loadLayoutCache, saveLayoutCache } from './lib/layoutLocalCache';
import {
  mirrorExchangeAuthPairingToken,
  mirrorFinalizeAuthPairing,
  mirrorGetAuthPairing,
  mirrorGetSession,
  mirrorAuthProviders,
  mirrorAuthLogout,
  mirrorOAuthWebStartUrl,
  mirrorRedeemAuthPairing,
  mirrorStartAuthPairing,
  mirrorGetWidgets,
  mirrorPutWidgets,
  mirrorGetCalendarEvents,
  mirrorGetCalendarTasks,
  type MirrorAuthProviderStatus,
} from './lib/mirrorApi';
import {
  consumeGoogleRedirectResult,
  ensureFirebaseAuthReady,
  signInWithFirebaseCustomToken,
  signInWithGoogle,
  signOutFromFirebase,
  subscribeToFirebaseAuth,
} from './firebase';
import { WidgetSummaryPanel, type HttpSyncState } from './components/WidgetSummaryPanel';
import { PrivateLoginGate, type PrivateLoginGateNotice, type PrivateLoginGatePendingPairing } from './components/PrivateLoginGate';
import { PublicMirrorSettingsModal, type PublicMirrorSettingsDraft, type PublicMirrorSettingsStatus } from './components/PublicMirrorSettingsModal';
import { CUSTOM_WIDGET_TEMPLATES, standaloneTextWidgetBaseId } from './lib/customWidgetTemplates';
import type {
  CalendarEventItem,
  MirrorAuthPairingStatusResponse,
  MirrorAuthPairingTokenExchangeResponse,
  MirrorSessionResponse,
  MirrorOAuthProvider,
  WidgetConfigOut,
} from './types/mirror';
import { WIDGETS_REMOTE_UPDATED_EVENT, createSessionId, createWidgetsSyncEnvelope } from './shared/ws/contracts';
import { MirrorConnectionManager } from './lib/connectionManager';
import {
  buildScopedWsUrl,
  clearMirrorLegacyUserId,
  getMirrorHardwareId,
  getMirrorHardwareToken,
  getMirrorHttpBase,
  getMirrorWsUrl,
  setMirrorHttpBase as persistMirrorHttpBase,
  setMirrorHardwareId as persistMirrorHardwareId,
  setMirrorHardwareToken as persistMirrorHardwareToken,
  setMirrorWsUrl as persistMirrorWsUrl,
} from './lib/connectionConfig';
import { FluidDropdown } from './components/ui/fluid-dropdown';
import { WIDGET_SIZE_PRESETS, inferWidgetSizePreset, type WidgetSizePreset } from './lib/widgetSizePresets';
import type { WidgetTemplateCategory } from './lib/customWidgetTemplates';
import { triggerMirrorCapture } from './features/camera/cameraApi';
import {
  CLOTHING_CATEGORIES,
  createClothingWithImage,
  deleteClothingItem,
  generateOutfitTryOn,
  listClothingItems,
  outfitSlotForCategory,
  personImageLatestUrl,
  primaryImageUrl,
  type ClothingItem,
  type ClothingItemCreate,
} from './features/wardrobe/clothingApi';
import { useWardrobeActions } from './features/wardrobe/useWardrobeActions';

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

type PairingQueryState = {
  pairingId: string;
  pairingCode: string;
};

const PENDING_PAIRING_HANDOFF_STORAGE_KEY = 'smart_mirror_pending_pairing_handoff';

function normalizePairingCode(raw: string): string {
  return raw.replace(/\s+/g, '').trim().toUpperCase();
}

function mergePairingState(
  ...states: Array<Partial<PairingQueryState> | null | undefined>
): PairingQueryState {
  return states.reduce<PairingQueryState>(
    (acc, state) => ({
      pairingId: acc.pairingId || state?.pairingId?.trim() || '',
      pairingCode: acc.pairingCode || normalizePairingCode(state?.pairingCode ?? ''),
    }),
    { pairingId: '', pairingCode: '' },
  );
}

function readPendingPairingHandoff(): PairingQueryState {
  if (typeof window === 'undefined') return { pairingId: '', pairingCode: '' };
  try {
    const raw = window.sessionStorage.getItem(PENDING_PAIRING_HANDOFF_STORAGE_KEY);
    if (!raw) return { pairingId: '', pairingCode: '' };
    const parsed = JSON.parse(raw) as Partial<PairingQueryState>;
    return mergePairingState(parsed);
  } catch {
    return { pairingId: '', pairingCode: '' };
  }
}

function persistPendingPairingHandoff(state: Partial<PairingQueryState>): PairingQueryState {
  const next = mergePairingState(state);
  if (typeof window === 'undefined') return next;
  if (!next.pairingId && !next.pairingCode) {
    window.sessionStorage.removeItem(PENDING_PAIRING_HANDOFF_STORAGE_KEY);
    return next;
  }
  window.sessionStorage.setItem(PENDING_PAIRING_HANDOFF_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function clearPendingPairingHandoff(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_PAIRING_HANDOFF_STORAGE_KEY);
}

function hasPairingState(state: PairingQueryState): boolean {
  return Boolean(state.pairingId || state.pairingCode);
}

function isSupportedMirrorProvider(provider: string | null | undefined): provider is MirrorOAuthProvider {
  return provider?.trim().toLowerCase() === 'google';
}

function readDeviceSettingsDraft(): PublicMirrorSettingsDraft {
  return {
    mirrorHttpBase: getMirrorHttpBase(),
    wsUrl: getMirrorWsUrl(),
    hardwareId: getMirrorHardwareId() ?? '',
    hardwareToken: getMirrorHardwareToken() ?? '',
  };
}

function persistDeviceSettingsDraft(draft: PublicMirrorSettingsDraft): PublicMirrorSettingsDraft {
  const next: PublicMirrorSettingsDraft = {
    mirrorHttpBase: draft.mirrorHttpBase.trim(),
    wsUrl: draft.wsUrl.trim(),
    hardwareId: draft.hardwareId.trim(),
    hardwareToken: draft.hardwareToken.trim(),
  };

  persistMirrorHttpBase(next.mirrorHttpBase);
  if (next.wsUrl) persistMirrorWsUrl(next.wsUrl);
  persistMirrorHardwareId(next.hardwareId);
  persistMirrorHardwareToken(next.hardwareToken);
  clearMirrorLegacyUserId();

  return next;
}

function readPairingQueryFromWindow(): PairingQueryState {
  if (typeof window === 'undefined') return { pairingId: '', pairingCode: '' };
  const search = new URLSearchParams(window.location.search);
  return {
    pairingId: search.get('pairing_id')?.trim() ?? '',
    pairingCode: normalizePairingCode(search.get('pairing_code') ?? ''),
  };
}

function clearPairingQueryFromWindow(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('pairing_id');
  url.searchParams.delete('pairing_code');
  window.history.replaceState({}, document.title, url.toString());
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.details || error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function isFatalPairingError(error: unknown): boolean {
  return error instanceof ApiError && [403, 404, 409].includes(error.status);
}

function formatRelativeExpiry(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function buildPendingPairingView(
  pairing: {
    provider?: string | null;
    pairing_code?: string | null;
    status?: string | null;
    expires_at?: string | null;
  } | null,
): PrivateLoginGatePendingPairing | null {
  if (!pairing) return null;
  return {
    providerLabel: pairing.provider ? `${pairing.provider[0].toUpperCase()}${pairing.provider.slice(1)} account` : 'Account linking',
    code: pairing.pairing_code ?? undefined,
    expiresAtLabel: formatRelativeExpiry(pairing.expires_at),
    statusLabel: pairing.status ?? undefined,
    instructions: [
      'Start the provider sign-in on the mirror or from the redirect page.',
      'Return here if prompted for a pairing code or deep link redemption.',
      'Wait for the app to confirm the account has been securely attached to Firebase.',
    ],
  };
}

async function waitForPairingReady(
  baseUrl: string,
  pairingId: string,
  onProgress: (status: MirrorAuthPairingStatusResponse) => void,
): Promise<MirrorAuthPairingStatusResponse> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await mirrorGetAuthPairing(baseUrl, pairingId);
    onProgress(status);
    if (status.custom_token_ready || status.status === 'complete' || status.status === 'authorized') {
      return status;
    }
    if (status.status === 'expired' || status.status === 'error') {
      return status;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  return mirrorGetAuthPairing(baseUrl, pairingId);
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

const MirrorWidget = ({
  widget,
  onUpdate,
  onResizeCommit,
  onConfigOpen,
  onRemove,
  containerRef
}: {
  widget: Widget;
  onUpdate: (id: string, updates: Partial<Widget>) => void;
  onResizeCommit: (id: string, width: number, height: number) => void;
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

type AuthenticatedAppProps = {
  firebaseUser: User;
  onSignOut: () => Promise<void>;
};

function AuthenticatedApp({ firebaseUser, onSignOut }: AuthenticatedAppProps) {
  const sessionIdRef = useRef(createSessionId());
  const [activeTab, setActiveTab] = useState<
    'layout' | 'camera' | 'wardrobe' | 'outfit' | 'connection' | 'accounts'
  >('layout');
  const [widgets, setWidgets] = useState<Widget[]>(() => {
    if (typeof window === 'undefined') return hydrateWidgetsFromSnapshots(DEFAULT_WIDGET_SNAPSHOTS);
    return loadLayoutCache(firebaseUser.uid) ?? hydrateWidgetsFromSnapshots(DEFAULT_WIDGET_SNAPSHOTS);
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
  const [outfitItems, setOutfitItems] = useState<ClothingItem[]>([]);
  const [selectedShirt, setSelectedShirt] = useState<ClothingItem | null>(null);
  const [selectedPants, setSelectedPants] = useState<ClothingItem | null>(null);
  const [selectedAccessory, setSelectedAccessory] = useState<ClothingItem | null>(null);
  const [personImageNonce, setPersonImageNonce] = useState(0);
  const [isGeneratingOutfit, setIsGeneratingOutfit] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window === 'undefined') return 'ws://localhost:8002/ws/control';
    try {
      return getMirrorWsUrl();
    } catch {
      return 'ws://localhost:8002/ws/control';
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [mirrorHardwareId, setMirrorHardwareId] = useState(() => getMirrorHardwareId() ?? '');
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
  const [mirrorHardwareIdDraft, setMirrorHardwareIdDraft] = useState(mirrorHardwareId);
  const [hardwareTokenDraft, setHardwareTokenDraft] = useState(() => getMirrorHardwareToken() ?? '');
  const [mirrorAuthList, setMirrorAuthList] = useState<MirrorAuthProviderStatus[]>([]);
  const [mirrorSession, setMirrorSession] = useState<MirrorSessionResponse | null>(null);
  const [mirrorSessionLoading, setMirrorSessionLoading] = useState(true);
  const [mirrorSessionError, setMirrorSessionError] = useState<string | null>(null);
  const [calendarEventsPreview, setCalendarEventsPreview] = useState<CalendarEventItem[]>([]);
  const [calendarTasksPreview, setCalendarTasksPreview] = useState<CalendarEventItem[]>([]);
  const [calendarPreviewProviders, setCalendarPreviewProviders] = useState<string[]>([]);
  const [calendarPreviewLastSync, setCalendarPreviewLastSync] = useState<string | null>(null);
  const [calendarPreviewLoading, setCalendarPreviewLoading] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [activePairing, setActivePairing] = useState<MirrorAuthPairingStatusResponse | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<MirrorAuthPairingTokenExchangeResponse | MirrorAuthPairingStatusResponse | null>(null);
  const [disconnectCandidate, setDisconnectCandidate] = useState<MirrorAuthProviderStatus | null>(null);
  const remoteRefreshInFlightRef = useRef(false);
  const remoteRefreshTimerRef = useRef<number | undefined>(undefined);
  const handledPairingQueryRef = useRef<string>('');
  const sessionBootstrapReady = Boolean(
    mirrorSession?.user?.uid === firebaseUser.uid
      && mirrorSession?.active_profile?.user_uid === firebaseUser.uid,
  );

  const filteredTemplates = useMemo(() => {
    if (activeTemplateCategory === 'all') return CUSTOM_WIDGET_TEMPLATES;
    return CUSTOM_WIDGET_TEMPLATES.filter((t) => t.category === activeTemplateCategory);
  }, [activeTemplateCategory]);
  const templateDropdownItems = useMemo(
    () => filteredTemplates.map((tmpl) => ({ id: tmpl.id, label: tmpl.label })),
    [filteredTemplates]
  );

  useEffect(() => {
    clearMirrorLegacyUserId();
  }, []);

  useEffect(() => {
    if (!filteredTemplates.some((t) => t.id === customTemplateId)) {
      setCustomTemplateId(filteredTemplates[0]?.id ?? CUSTOM_WIDGET_TEMPLATES[0]?.id ?? 'sticky-note');
    }
  }, [filteredTemplates, customTemplateId]);

  useEffect(() => {
    if (!showSettings) return;
    setMirrorHttpDraft(mirrorHttpBase);
    setWsUrlDraft(wsUrl);
    setMirrorHardwareIdDraft(mirrorHardwareId);
    setHardwareTokenDraft(getMirrorHardwareToken() ?? '');
  }, [showSettings, mirrorHardwareId, mirrorHttpBase, wsUrl]);

  const scopedWsUrl = useMemo(() => buildScopedWsUrl(wsUrl), [wsUrl, mirrorHardwareId]);

  useEffect(() => {
    setWsUrl(getMirrorWsUrl());
  }, [mirrorHardwareId]);

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
      saveLayoutCache(next, firebaseUser.uid);
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
      const cached = loadLayoutCache(firebaseUser.uid);
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

  const loadMirrorSession = useCallback(async () => {
    const base = mirrorHttpRef.current.trim();
    if (!base) {
      setMirrorSession(null);
      setMirrorSessionError('Mirror HTTP base is required before private session checks can run.');
      setMirrorSessionLoading(false);
      return;
    }

    setMirrorSessionLoading(true);
    setMirrorSessionError(null);
    try {
      const session = await mirrorGetSession(base);
      setMirrorSession(session);
    } catch (error) {
      setMirrorSession(null);
      setMirrorSessionError(formatErrorMessage(error, 'Could not verify mirror role.'));
    } finally {
      setMirrorSessionLoading(false);
    }
  }, []);

  const loadMirrorAuth = useCallback(async () => {
    const base = mirrorHttpRef.current.trim();
    if (!base) {
      setMirrorAuthList([]);
      return;
    }
    try {
      const list = await mirrorAuthProviders(base);
      setMirrorAuthList(list.filter((row) => isSupportedMirrorProvider(String(row.provider))));
    } catch {
      setMirrorAuthList([]);
    }
  }, []);

  const refreshMirrorSecurityState = useCallback(async () => {
    await Promise.all([loadMirrorSession(), loadMirrorAuth()]);
  }, [loadMirrorAuth, loadMirrorSession]);

  const loadCalendarPreview = useCallback(async () => {
    const base = mirrorHttpRef.current.trim();
    if (!base) {
      setCalendarEventsPreview([]);
      setCalendarTasksPreview([]);
      setCalendarPreviewProviders([]);
      setCalendarPreviewLastSync(null);
      return;
    }
    setCalendarPreviewLoading(true);
    try {
      const [eventsRes, tasksRes] = await Promise.all([
        mirrorGetCalendarEvents(base, { days: 7 }),
        mirrorGetCalendarTasks(base),
      ]);
      setCalendarEventsPreview(eventsRes.events.slice(0, 4));
      setCalendarTasksPreview(tasksRes.tasks.slice(0, 4));
      setCalendarPreviewProviders(Array.from(new Set([...eventsRes.providers, ...tasksRes.providers])));
      setCalendarPreviewLastSync(eventsRes.last_sync ?? tasksRes.last_sync ?? null);
    } catch {
      setCalendarEventsPreview([]);
      setCalendarTasksPreview([]);
      setCalendarPreviewProviders([]);
      setCalendarPreviewLastSync(null);
    } finally {
      setCalendarPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMirrorSecurityState();
  }, [mirrorHardwareId, mirrorHttpBase, refreshMirrorSecurityState]);

  useEffect(() => {
    if (sessionBootstrapReady) return;
    const id = window.setInterval(() => {
      void loadMirrorSession();
    }, 3000);
    return () => clearInterval(id);
  }, [loadMirrorSession, sessionBootstrapReady]);

  useEffect(() => {
    if (activeTab !== 'accounts') return;
    void refreshMirrorSecurityState();
    void loadCalendarPreview();
    const id = window.setInterval(() => {
      void refreshMirrorSecurityState();
      void loadCalendarPreview();
    }, 8000);
    return () => clearInterval(id);
  }, [activeTab, loadCalendarPreview, refreshMirrorSecurityState]);

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
          saveLayoutCache(list, firebaseUser.uid);
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
    const t = window.setTimeout(() => saveLayoutCache(widgets, firebaseUser.uid), 400);
    return () => window.clearTimeout(t);
  }, [firebaseUser.uid, widgets]);

  // --- WebSocket via MirrorConnectionManager ---
  const messageHandlerRef = useRef<(data: Record<string, unknown>) => void>(() => {});
  messageHandlerRef.current = (data: Record<string, unknown>) => {
    const type = data.type as string | undefined;
    if (type === 'DEVICE_CONNECTED') { toast.success('Paired with mirror'); return; }
    if (type === 'DEVICE_ERROR') { toast.error(String((data.payload as Record<string, unknown>)?.message ?? 'Pairing failed')); return; }
    if (type === 'CAMERA_LOADING_STARTED') {
      setCameraLoading(true);
      setCountdown(null);
      return;
    }
    if (type === 'CAMERA_LOADING_READY') {
      setCameraLoading(false);
      return;
    }
    if (type === 'CAMERA_COUNTDOWN_TICK') {
      setCameraLoading(false);
      const remaining = Number((data.payload as Record<string, unknown>)?.remaining);
      if (Number.isFinite(remaining)) setCountdown(remaining);
      return;
    }
    if (type === 'CAMERA_CAPTURED') {
      setCameraLoading(false);
      setCountdown(null);
      setPersonImageNonce((n) => n + 1);
      toast.success('Photo captured');
      return;
    }
    if (type === 'CAMERA_ERROR') {
      setCameraLoading(false);
      setCountdown(null);
      toast.error(String((data.payload as Record<string, unknown>)?.message ?? 'Camera error'));
      return;
    }
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
      scopedWsUrl,
    );
    connectionManagerRef.current = mgr;
    mgr.connect();
    return () => { mgr.dispose(); connectionManagerRef.current = null; };
  }, [scopedWsUrl]);

  const sendEnvelopeToMirror = (envelope: Record<string, unknown>) => {
    if (!connectionManagerRef.current?.send(envelope)) {
      toast.error('Mirror not connected');
    }
  };
  const { notifyWardrobeUpdated, clearDeletedSelection } = useWardrobeActions(
    sessionIdRef.current,
    sendEnvelopeToMirror,
  );

  const syncStateToMirror = useCallback((currentWidgets?: Widget[]) => {
    const widgetsToSync = currentWidgets ?? widgetsRef.current;
    const mgr = connectionManagerRef.current;
    sendEnvelopeToMirror(createWidgetsSyncEnvelope(mgr?.getSessionId() ?? sessionIdRef.current, widgetsToSync));
  }, []);

  // --- Clothing API sync (wardrobe + outfit tabs) ---
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const base = mirrorHttpBase.trim();
      if (!base) {
        if (!cancelled) {
          setWardrobe([]);
          setOutfitItems([]);
        }
        return;
      }
      try {
        const items = await listClothingItems(base, true);
        if (!cancelled) {
          setWardrobe(items);
          setOutfitItems(items.filter((it) => primaryImageUrl(it)));
        }
      } catch {
        if (!cancelled) {
          setWardrobe([]);
          setOutfitItems([]);
        }
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

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const base = mirrorHttpBase.trim();
    if (!base) {
      toast.error('Set Mirror HTTP base before uploading');
      return;
    }
    openUploadModal(file);
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
      setOutfitItems((prev) => (primaryImageUrl(item) ? [item, ...prev] : prev));
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
      setOutfitItems((prev) => prev.filter((item) => item.id !== id));
      clearDeletedSelection(
        id,
        { shirt: selectedShirt, pants: selectedPants, accessory: selectedAccessory },
        {
          setShirt: setSelectedShirt,
          setPants: setSelectedPants,
          setAccessory: setSelectedAccessory,
        },
      );
      toast.success('Item removed');
      notifyWardrobeUpdated();
    } catch {
      toast.error('Delete failed');
    }
  };

  const itemsForSlot = (slot: 'shirt' | 'pants' | 'accessories') =>
    outfitItems.filter((it) => outfitSlotForCategory(it.category) === slot);

  const randomizeOutfit = () => {
    const pick = (slot: 'shirt' | 'pants' | 'accessories') => {
      const pool = itemsForSlot(slot);
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)] ?? null;
    };
    setSelectedShirt(pick('shirt'));
    setSelectedPants(pick('pants'));
    setSelectedAccessory(pick('accessories'));
  };

  const submitOutfitTryOn = async () => {
    const base = mirrorHttpBase.trim();
    if (!base) {
      toast.error('Set Mirror HTTP base');
      return;
    }
    const ids: number[] = [];
    for (const it of [selectedShirt, selectedPants, selectedAccessory]) {
      if (!it) continue;
      const url = primaryImageUrl(it);
      const img = it.images?.find((i) => i.image_url === url) ?? it.images?.[0];
      if (img) ids.push(img.id);
    }
    if (!ids.length) {
      toast.error('Select at least one clothing item');
      return;
    }
    setIsGeneratingOutfit(true);
    try {
      await generateOutfitTryOn(base, ids);
      toast.success('Try-on sent to mirror');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Try-on failed');
    } finally {
      setIsGeneratingOutfit(false);
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

  // --- Camera Trigger ---
  const triggerCapture = async () => {
    const base = mirrorHttpBase.trim();
    if (!base) {
      toast.error('Set Mirror HTTP base to trigger camera capture');
      return;
    }
    try {
      setCameraLoading(true);
      setCountdown(null);
      await triggerMirrorCapture(base, sessionIdRef.current);
      toast.success('Capture request sent');
    } catch {
      setCameraLoading(false);
      setCountdown(null);
      toast.error('Could not trigger capture');
    }
  };

  const isAdmin = mirrorSession?.role === 'admin';
  const currentUserProviders = useMemo(
    () =>
      mirrorAuthList.filter(
        (row) =>
          isSupportedMirrorProvider(String(row.provider))
          && (
            row.owner_user_uid
              ? row.owner_user_uid === firebaseUser.uid
              : row.is_current_user_owner !== false
          ),
      ),
    [firebaseUser.uid, mirrorAuthList],
  );
  const managedProviders = useMemo(
    () =>
      mirrorAuthList.filter(
        (row) =>
          isSupportedMirrorProvider(String(row.provider))
          && (
            row.owner_user_uid
              ? row.owner_user_uid !== firebaseUser.uid
              : row.is_current_user_owner === false
          ),
      ),
    [firebaseUser.uid, mirrorAuthList],
  );

  const completePairingFlow = useCallback(
    async (pairingId: string, replaceCurrentSession = false) => {
      const base = mirrorHttpRef.current.trim();
      if (!base) {
        toast.error('Set Mirror HTTP base before finishing account linking.');
        return;
      }

      setPairingBusy(true);
      try {
        const finalized = await mirrorFinalizeAuthPairing(base, pairingId, {
          replace_current_session: replaceCurrentSession,
        });
        setActivePairing(finalized);
        if (finalized.requires_session_replacement && !replaceCurrentSession) {
          setPendingReplacement(finalized);
          return;
        }

        const ready = finalized.custom_token_ready
          ? finalized
          : await waitForPairingReady(base, pairingId, setActivePairing);
        setActivePairing(ready);

        if (ready.status === 'expired') {
          throw new Error('This pairing session expired. Start a new mirror sign-in and try again.');
        }
        if (ready.status === 'error') {
          throw new Error(ready.error_message ?? 'Mirror pairing failed.');
        }

        if (!ready.custom_token_ready) {
          toast.success('Account linked securely.');
          clearPairingQueryFromWindow();
          clearPendingPairingHandoff();
          await refreshMirrorSecurityState();
          await loadCalendarPreview();
          setActivePairing(null);
          return;
        }

        const exchange = await mirrorExchangeAuthPairingToken(base, pairingId, {
          replace_current_session: replaceCurrentSession,
        });

        if (exchange.user.uid !== firebaseUser.uid && !replaceCurrentSession) {
          setPendingReplacement(exchange);
          return;
        }

        clearPairingQueryFromWindow();

        if (exchange.user.uid !== firebaseUser.uid) {
          await signInWithFirebaseCustomToken(exchange.custom_token);
          clearPendingPairingHandoff();
          toast.success(`Signed in as ${exchange.user.email ?? 'new user'} through secure pairing.`);
          return;
        }

        toast.success('Account linked securely.');
        clearPendingPairingHandoff();
        setPendingReplacement(null);
        setActivePairing(null);
        await refreshMirrorSecurityState();
        await loadCalendarPreview();
      } catch (error) {
        toast.error(formatErrorMessage(error, 'Could not finish account linking.'));
      } finally {
        setPairingBusy(false);
      }
    },
    [firebaseUser.uid, loadCalendarPreview, refreshMirrorSecurityState],
  );

  const startProviderPairing = useCallback(
    async (provider: MirrorOAuthProvider, surface: 'mirror' | 'browser') => {
      const base = mirrorHttpRef.current.trim();
      if (!base) {
        toast.error('Set Mirror HTTP base before linking an account.');
        return;
      }

      setPairingBusy(true);
      try {
        const redirectTo =
          typeof window === 'undefined' ? null : `${window.location.origin}${window.location.pathname}`;
        const pairing = await mirrorStartAuthPairing(base, {
          provider,
          intent: 'link_provider',
          redirect_to: redirectTo,
        });
        setActivePairing(pairing as MirrorAuthPairingStatusResponse);

        if (surface === 'browser') {
          const nextUrl =
            pairing.oauth_url ??
            pairing.deep_link_url ??
            mirrorOAuthWebStartUrl(base, provider, {
              pairingId: pairing.pairing_id,
              redirectTo,
            });
          window.location.href = nextUrl;
          return;
        }

        toast.success(
          pairing.pairing_code
            ? `Mirror pairing started. Redeem code ${pairing.pairing_code} if prompted here.`
            : 'Mirror pairing started. Finish sign-in on the mirror screen.',
        );
      } catch (error) {
        toast.error(formatErrorMessage(error, 'Could not start provider linking.'));
      } finally {
        setPairingBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const query = readPairingQueryFromWindow();
    const stored = readPendingPairingHandoff();
    const pending = mergePairingState(query, stored);
    const marker = `${pending.pairingId}:${pending.pairingCode}`;
    if (!hasPairingState(pending)) return;
    if (handledPairingQueryRef.current === marker) return;
    handledPairingQueryRef.current = marker;

    void (async () => {
      const base = mirrorHttpRef.current.trim();
      if (!base) {
        toast.error('Set Mirror HTTP base before redeeming a pairing redirect.');
        return;
      }

      try {
        setPairingBusy(true);
        let pairingId = pending.pairingId;
        if (pending.pairingCode) {
          const redeemed = await mirrorRedeemAuthPairing(base, { pairing_code: pending.pairingCode });
          pairingId = redeemed.pairing_id;
          setActivePairing({
            ...(redeemed as MirrorAuthPairingStatusResponse),
            pairing_code: pending.pairingCode,
          });
        }
        if (!pairingId) {
          setPairingBusy(false);
          return;
        }
        await completePairingFlow(pairingId);
      } catch (error) {
        setPairingBusy(false);
        if (isFatalPairingError(error)) {
          clearPairingQueryFromWindow();
          clearPendingPairingHandoff();
        }
        toast.error(formatErrorMessage(error, 'Could not redeem the pairing redirect.'));
      }
    })();
  }, [completePairingFlow]);

  const confirmDisconnect = useCallback(async () => {
    const target = disconnectCandidate;
    if (!target) return;
    try {
      await mirrorAuthLogout(mirrorHttpBase, String(target.provider));
      toast.success(
        target.owner_email && target.owner_email !== firebaseUser.email
          ? `Disconnected ${target.provider} for ${target.owner_email}.`
          : 'Disconnected provider.',
      );
      setDisconnectCandidate(null);
      await refreshMirrorSecurityState();
    } catch (error) {
      toast.error(formatErrorMessage(error, 'Disconnect failed.'));
    }
  }, [disconnectCandidate, firebaseUser.email, mirrorHttpBase, refreshMirrorSecurityState]);

  const confirmSessionReplacement = useCallback(async () => {
    const pending = pendingReplacement;
    if (!pending) return;
    try {
      if ('custom_token' in pending) {
        clearPairingQueryFromWindow();
        await signInWithFirebaseCustomToken(pending.custom_token);
        clearPendingPairingHandoff();
        toast.success(`Signed in as ${pending.user.email ?? 'new user'} through secure pairing.`);
      } else {
        await completePairingFlow(pending.pairing_id, true);
      }
      setPendingReplacement(null);
    } catch (error) {
      toast.error(formatErrorMessage(error, 'Could not replace the current session.'));
    }
  }, [completePairingFlow, pendingReplacement]);

  return (
    <div className="min-h-screen bg-black text-white p-6 font-[var(--font-sans)] selection:bg-white/20 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[60%] h-[50%] bg-[radial-gradient(ellipse_at_20%_20%,rgba(94,225,217,0.06)_0%,transparent_70%)]" />
        <div className="absolute bottom-0 right-0 w-[50%] h-[40%] bg-[radial-gradient(ellipse_at_80%_80%,rgba(96,165,250,0.04)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
      </div>
      <div className="relative z-10">
      <Toaster theme="dark" position="top-center" />
      {!sessionBootstrapReady && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-950/90 border border-white/[0.08] rounded-3xl p-8 space-y-4 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <h1 className="text-2xl font-medium font-[var(--font-display)]">Mirror Companion</h1>
            {mirrorSessionLoading ? (
              <p className="text-sm text-white/55">
                Connecting your Firebase session to the mirror and waiting for the active profile to appear.
              </p>
            ) : mirrorSessionError ? (
              <p className="text-sm text-white/55">
                We could not bootstrap the mirror session yet. Check the device settings and backend auth contract.
              </p>
            ) : (
              <p className="text-sm text-white/55">
                Firebase sign-in succeeded. The app will unlock as soon as this mirror activates your profile.
              </p>
            )}
            <p className="text-xs text-white/40">
              Hardware: {mirrorHardwareId || 'Not set'}
              <br />
              Active profile: {mirrorSession?.active_profile?.email ?? mirrorSession?.active_profile?.user_uid ?? 'waiting'}
            </p>
            {mirrorSessionError ? <p className="text-sm text-amber-300/90">{mirrorSessionError}</p> : null}
            <button
              type="button"
              onClick={() => void refreshMirrorSecurityState()}
              className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-white/90"
            >
              Retry session bootstrap
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="w-full border border-white/10 text-white/70 py-3 rounded-xl hover:border-white/25 hover:text-white"
            >
              Open device settings
            </button>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col items-end px-3 py-2 rounded-2xl border border-white/10 bg-white/[0.04]">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Signed in</span>
            <span className="text-sm text-white/80">{firebaseUser.email ?? 'Private session'}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-2.5 text-white/30 hover:text-white/80 transition-colors rounded-xl hover:bg-white/[0.04]"
          >
            <Settings size={20} />
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="p-2.5 text-white/30 hover:text-white/80 transition-colors rounded-xl hover:bg-white/[0.04]"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <nav className="max-w-7xl mx-auto mb-6">
        <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm p-1 gap-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
          {[
            { id: 'layout', label: 'Layout' },
            { id: 'camera', label: 'Camera' },
            { id: 'wardrobe', label: 'Wardrobe' },
            { id: 'outfit', label: 'Outfit' },
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
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-6">
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
              className="relative w-full max-w-sm bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
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
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Mirror hardware id</label>
                  <input
                    type="text"
                    value={mirrorHardwareIdDraft}
                    onChange={(e) => setMirrorHardwareIdDraft(e.target.value)}
                    placeholder="mirror-001"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    Mirror Hardware Token
                  </label>
                  <input
                    type="text"
                    value={hardwareTokenDraft}
                    onChange={(e) => setHardwareTokenDraft(e.target.value)}
                    placeholder="token from /api/mirror/register"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
                
                <button 
                  type="button"
                  onClick={() => {
                    const v = mirrorHttpDraft.trim();
                    const nextWs = wsUrlDraft.trim();
                    const nextHardwareId = mirrorHardwareIdDraft.trim();
                    const nextHardwareToken = hardwareTokenDraft.trim();
                    persistMirrorHttpBase(v);
                    if (nextWs) persistMirrorWsUrl(nextWs);
                    persistMirrorHardwareId(nextHardwareId);
                    persistMirrorHardwareToken(nextHardwareToken);
                    setMirrorHttpBase(v);
                    if (nextWs) setWsUrl(nextWs);
                    setMirrorHardwareId(nextHardwareId);
                    setAuthNotice(null);
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
              className="relative w-full max-w-sm bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden max-h-[90vh] overflow-y-auto"
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
                  Tag this item before the image is uploaded to Cloudinary.
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
                  <select
                    value={uploadMeta.category}
                    onChange={(e) => setUploadMeta((m) => ({ ...m, category: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm"
                  >
                    {CLOTHING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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
              className="relative w-full max-w-sm bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
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
              Google account linking
            </h2>
            <p className="text-sm text-white/45">
              Firebase decides who you are. The mirror only exposes household account actions that match your verified role.
            </p>

            <GlassCard className="space-y-3">
              <h3 className="text-sm font-medium text-white/90">Private session</h3>
              {mirrorSessionLoading ? (
                <p className="text-xs text-white/35">Checking your mirror role...</p>
              ) : mirrorSessionError ? (
                <p className="text-xs text-amber-200/90">{mirrorSessionError}</p>
              ) : (
                <>
                  <p className="text-sm text-white/70">
                    Signed in as <span className="text-white">{firebaseUser.email ?? 'private user'}</span>
                  </p>
                  <p className="text-xs text-white/45">
                    Role: {isAdmin ? 'Household admin' : 'Member'} · Mirror claimed: {mirrorSession?.hardware_claimed ? 'yes' : 'no'}
                  </p>
                  <p className="text-xs text-white/45">
                    Active profile:{' '}
                    <span className="text-white/80">
                      {mirrorSession?.active_profile?.display_name
                        ?? mirrorSession?.active_profile?.email
                        ?? mirrorSession?.active_profile?.user_uid
                        ?? 'Waiting for mirror activation'}
                    </span>
                  </p>
                  {mirrorSession?.active_profile?.email ? (
                    <p className="text-xs text-white/35">{mirrorSession.active_profile.email}</p>
                  ) : null}
                </>
              )}
            </GlassCard>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-medium text-white/90">Device context</h3>
              <div className="space-y-2 text-xs text-white/55">
                <p>Hardware: {mirrorHardwareId || 'Not set'}</p>
                <p>HTTP base: {mirrorHttpBase || 'Not set'}</p>
              </div>
              {authNotice && (
                <p className="text-xs text-amber-300/90">
                  {authNotice}
                </p>
              )}
              {!mirrorHardwareId.trim() && (
                <p className="text-xs text-white/40">
                  Set the mirror hardware id in Settings so the backend can attach this Firebase session to the right mirror device.
                </p>
              )}
            </GlassCard>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-medium text-white/90">Sign in on the mirror (QR)</h3>
              <p className="text-xs text-white/40">
                Starts a secure pairing session for the currently signed-in Firebase user. Your mirror may show a QR code or pairing code.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={pairingBusy}
                  className="bg-white/10 border border-white/15 rounded-xl py-3 text-sm hover:bg-white/15 transition-colors"
                  onClick={() => void startProviderPairing('google', 'mirror')}
                >
                  Google (QR on mirror)
                </button>
              </div>
              {activePairing ? (
                <p className="text-xs text-white/45">
                  Active pairing: {buildPendingPairingView(activePairing)?.code ?? 'waiting for code'} · {activePairing.status}
                </p>
              ) : null}
            </GlassCard>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-medium text-white/90">Sign in on this device</h3>
              <p className="text-xs text-white/40">
                Opens provider auth in your browser and returns with a pairing session bound to this Firebase user.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={pairingBusy}
                  className="bg-white text-black rounded-xl py-3 text-sm font-medium hover:bg-white/90 transition-colors"
                  onClick={() => void startProviderPairing('google', 'browser')}
                >
                  Google in browser
                </button>
              </div>
            </GlassCard>

            <GlassCard className="space-y-3">
              <h3 className="text-sm font-medium text-white/90">Status</h3>
              {mirrorSessionLoading ? (
                <p className="text-xs text-white/35">Loading household status...</p>
              ) : mirrorSessionError ? (
                <p className="text-xs text-amber-200/90">{mirrorSessionError}</p>
              ) : mirrorAuthList.length === 0 ? (
                <p className="text-xs text-white/35">No supported Google provider links are active for this mirror yet.</p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Your linked providers</p>
                    <ul className="space-y-2">
                      {currentUserProviders.map((row) => (
                        <li
                          key={`${row.owner_user_uid ?? firebaseUser.uid}-${row.provider}`}
                          className="flex items-center justify-between gap-3 text-sm border border-white/10 rounded-xl px-3 py-2"
                        >
                          <div>
                            <span className="capitalize">{row.provider}</span>
                            <p className="text-[11px] text-white/35">{row.owner_email ?? firebaseUser.email ?? 'Current user'}</p>
                          </div>
                          <span className={row.connected ? 'text-emerald-400' : 'text-white/40'}>
                            {row.connected ? 'Connected' : 'Not connected'}
                          </span>
                          {row.connected && row.can_disconnect !== false ? (
                            <button
                              type="button"
                              className="text-xs text-red-300 hover:text-red-200"
                              onClick={() => setDisconnectCandidate(row)}
                            >
                              Disconnect
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {isAdmin && managedProviders.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Admin-managed household providers</p>
                      <ul className="space-y-2">
                        {managedProviders.map((row) => (
                          <li
                            key={`${row.owner_user_uid ?? 'external'}-${row.provider}`}
                            className="flex items-center justify-between gap-3 text-sm border border-white/10 rounded-xl px-3 py-2"
                          >
                            <div>
                              <span className="capitalize">{row.provider}</span>
                              <p className="text-[11px] text-white/35">{row.owner_email ?? row.owner_user_uid ?? 'Household member'}</p>
                            </div>
                            <span className={row.connected ? 'text-emerald-400' : 'text-white/40'}>
                              {row.connected ? 'Connected' : 'Not connected'}
                            </span>
                            {row.connected && row.can_disconnect ? (
                              <button
                                type="button"
                                className="text-xs text-red-300 hover:text-red-200"
                                onClick={() => setDisconnectCandidate(row)}
                              >
                                Disconnect
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </GlassCard>
            <GlassCard className="space-y-3">
              <h3 className="text-sm font-medium text-white/90">Active mirror profile</h3>
              {mirrorSessionLoading ? (
                <p className="text-xs text-white/35">Loading active profile...</p>
              ) : !mirrorSession?.active_profile ? (
                <p className="text-xs text-white/35">No active profile has been activated for this mirror yet.</p>
              ) : (
                <ul className="space-y-2">
                  {[mirrorSession.active_profile].map((profile) => (
                    <li
                      key={profile.user_uid}
                      className="flex items-center justify-between gap-3 text-sm border border-white/10 rounded-xl px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-white/85">{profile.display_name?.trim() || profile.email || profile.user_uid}</div>
                        <div className="truncate text-xs text-white/40">
                          {profile.email || profile.user_uid}{profile.is_active ? ' · Active' : ''}
                        </div>
                      </div>
                      <span className="text-xs text-emerald-300/80">
                        {profile.is_active ? 'Current mirror user' : 'Pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
            <GlassCard className="space-y-3">
              <h3 className="text-sm font-medium text-white/90">Calendar + tasks preview</h3>
              {mirrorSessionLoading ? (
                <p className="text-xs text-white/35">Waiting for session bootstrap...</p>
              ) : mirrorSessionError ? (
                <p className="text-xs text-amber-200/90">Mirror session bootstrap must succeed before Google-backed widgets can preview.</p>
              ) : calendarPreviewLoading ? (
                <p className="text-xs text-white/35">Loading feed preview...</p>
              ) : (
                <>
                  <p className="text-xs text-white/45">
                    Events: {calendarEventsPreview.length} · Tasks: {calendarTasksPreview.length}
                  </p>
                  <p className="text-xs text-white/35">
                    Providers: {calendarPreviewProviders.length ? calendarPreviewProviders.join(', ') : 'none'}
                  </p>
                  <p className="text-xs text-white/30">
                    Last sync: {calendarPreviewLastSync ?? 'unknown'}
                  </p>
                  <div className="space-y-1">
                    {calendarEventsPreview.map((event) => (
                      <p key={`evt-${event.id}`} className="text-xs text-white/60 truncate">
                        Event: {event.title}
                      </p>
                    ))}
                    {calendarTasksPreview.map((task) => (
                      <p key={`task-${task.id}`} className="text-xs text-white/60 truncate">
                        Task: {task.title}
                      </p>
                    ))}
                    {calendarEventsPreview.length === 0 && calendarTasksPreview.length === 0 && (
                      <p className="text-xs text-white/35">No preview data available.</p>
                    )}
                  </div>
                </>
              )}
            </GlassCard>
          </section>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Mirror Canvas */}
          {(activeTab === 'layout' || activeTab === 'connection') && (
          <section className="lg:col-span-5 xl:col-span-4">
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
                <p className="text-[10px] text-white/20 w-full sm:w-auto">Drag to position</p>
              </div>
            </div>
            
            <div 
              ref={mirrorRef}
              className="relative w-full aspect-[9/16] bg-black border border-white/[0.08] rounded-[2.5rem] overflow-hidden group mx-auto max-w-[400px] lg:max-w-none shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]"
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
          )}

          {/* Right Column: Controls & Wardrobe */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-12">
            {(activeTab === 'layout' || activeTab === 'connection') && <WidgetSummaryPanel
              widgets={widgets}
              mirrorHttpBase={mirrorHttpBase}
              httpSyncState={httpSyncState}
              onRefreshFromMirror={() => void loadLayoutFromMirror({ silent: false })}
              onRemoveWidget={handleRemoveWidget}
            />}
            {/* Camera Section */}
            {(activeTab === 'layout' || activeTab === 'camera') && <section>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Camera</h2>
              </div>
              <GlassCard className="flex flex-col md:flex-row items-center justify-center gap-8 py-8 px-12">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-2 border-white/10 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {cameraLoading ? (
                        <motion.div
                          key="camera-loading"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                          className="flex flex-col items-center gap-2 text-white/80"
                        >
                          <Loader2 size={26} className="animate-spin" />
                          <span className="text-[9px] uppercase tracking-wider text-white/60">Loading</span>
                        </motion.div>
                      ) : countdown ? (
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
                  <p className="text-xs text-white/40 mb-2">
                    {cameraLoading
                      ? 'Camera Loading... preparing capture pipeline.'
                      : 'Trigger the mirror\'s camera for a quick snapshot.'}
                  </p>
                  <button 
                    onClick={triggerCapture}
                    disabled={cameraLoading || !!countdown}
                    className="bg-white text-black px-10 py-3 rounded-full font-medium hover:bg-white/90 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {cameraLoading ? 'Loading Camera...' : 'Capture Pose'}
                  </button>
                </div>
              </GlassCard>
            </section>}

            {/* Wardrobe Section */}
            {(activeTab === 'layout' || activeTab === 'wardrobe') && <section>
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
                    <GlassCard 
                      onClick={() => {
                        const url = primaryImageUrl(item);
                        if (!url) return;
                        notifyWardrobeUpdated({
                          selected_image_url: url,
                          selected_item_id: item.id,
                        });
                      }}
                      className="p-0 overflow-hidden aspect-square cursor-pointer"
                    >
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
                    No wardrobe items yet. Upload one to start virtual try-on.
                  </p>
                </div>
              )}
            </section>}

            {(activeTab === 'layout' || activeTab === 'outfit') && (
              <section>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold flex items-center gap-2">
                    <Sparkles size={14} className="text-white/50" />
                    Outfit generation
                  </h2>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <GlassCard className="p-4 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-white/35">Person photo (mirror)</p>
                    <div className="aspect-[3/4] rounded-xl overflow-hidden bg-white/5 border border-white/10 relative">
                      {mirrorHttpBase.trim() ? (
                        <img
                          key={personImageNonce}
                          src={`${personImageLatestUrl(mirrorHttpBase.trim())}?t=${personImageNonce}`}
                          alt="Latest person photo"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setPersonImageNonce((n) => n + 1)}
                        className="absolute bottom-2 right-2 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white/80 hover:bg-black/80"
                      >
                        Refresh
                      </button>
                    </div>
                    <p className="text-[11px] text-white/35">
                      Uses the latest image saved on the mirror (POST /api/tryon/person-image or Pi capture).
                    </p>
                  </GlassCard>

                  <div className="space-y-4">
                    {(
                      [
                        ['shirt', 'Shirt / top', selectedShirt, setSelectedShirt] as const,
                        ['pants', 'Pants', selectedPants, setSelectedPants] as const,
                        ['accessories', 'Accessories', selectedAccessory, setSelectedAccessory] as const,
                      ] as const
                    ).map(([slot, label, selected, setSelected]) => {
                      const pool = itemsForSlot(slot);
                      const cycle = (delta: number) => {
                        if (!pool.length) return;
                        const idx = selected ? pool.findIndex((i) => i.id === selected.id) : -1;
                        const next = (idx + delta + pool.length * 2) % pool.length;
                        setSelected(pool[next] ?? null);
                      };
                      const url = selected ? primaryImageUrl(selected) : null;
                      return (
                        <GlassCard key={slot} className="p-3 flex gap-3 items-center">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">{label}</p>
                            <p className="text-xs text-white/50 truncate">{selected?.name ?? 'None'}</p>
                          </div>
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0">
                            {url ? (
                              <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-white/20">—</div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => cycle(-1)}
                              disabled={!pool.length}
                              className="text-[10px] px-2 py-1 rounded bg-white/10 disabled:opacity-30"
                            >
                              Prev
                            </button>
                            <button
                              type="button"
                              onClick={() => cycle(1)}
                              disabled={!pool.length}
                              className="text-[10px] px-2 py-1 rounded bg-white/10 disabled:opacity-30"
                            >
                              Next
                            </button>
                          </div>
                        </GlassCard>
                      );
                    })}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={randomizeOutfit}
                        className="flex-1 min-w-[120px] bg-white/10 hover:bg-white/15 text-sm py-2.5 rounded-full"
                      >
                        Random outfit
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitOutfitTryOn()}
                        disabled={isGeneratingOutfit}
                        className="flex-1 min-w-[120px] bg-white text-black text-sm py-2.5 rounded-full font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGeneratingOutfit ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                        Generate try-on
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'connection' && (
              <section>
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
          </div>
        </div>
        )}
      </main>

      <AnimatePresence>
        {disconnectCandidate ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDisconnectCandidate(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            >
              <h3 className="text-lg font-medium text-white">Disconnect linked account?</h3>
              <p className="mt-3 text-sm text-white/60">
                {disconnectCandidate.owner_email && disconnectCandidate.owner_email !== firebaseUser.email
                  ? `This will remove ${disconnectCandidate.provider} access for ${disconnectCandidate.owner_email}.`
                  : `This will remove ${disconnectCandidate.provider} access from your mirror account.`}
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDisconnectCandidate(null)}
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/75"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDisconnect()}
                  className="flex-1 rounded-full bg-red-400 px-4 py-3 text-sm font-medium text-black"
                >
                  Disconnect
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pendingReplacement ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingReplacement(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            >
              <h3 className="text-lg font-medium text-white">Replace the current session?</h3>
              <p className="mt-3 text-sm text-white/60">
                This pairing completed for{' '}
                {'user' in pendingReplacement
                  ? pendingReplacement.user.email ?? 'another user'
                  : pendingReplacement.paired_user?.email ?? 'another user'}
                . Confirming will sign out {firebaseUser.email ?? 'the current user'} and continue as that person.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingReplacement(null)}
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/75"
                >
                  Stay signed in
                </button>
                <button
                  type="button"
                  onClick={() => void confirmSessionReplacement()}
                  className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-medium text-black"
                >
                  Replace session
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

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

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [redirectResultResolved, setRedirectResultResolved] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingCode, setPairingCode] = useState(
    () => mergePairingState(readPairingQueryFromWindow(), readPendingPairingHandoff()).pairingCode,
  );
  const [notice, setNotice] = useState<PrivateLoginGateNotice | null>(null);
  const [pendingPairing, setPendingPairing] = useState<PrivateLoginGatePendingPairing | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<PublicMirrorSettingsDraft>(() => readDeviceSettingsDraft());
  const [settingsStatus, setSettingsStatus] = useState<PublicMirrorSettingsStatus | null>(null);
  const signedOutPairingMarkerRef = useRef('');

  useEffect(() => {
    void ensureFirebaseAuthReady().catch(() => undefined);
    const unsubscribe = subscribeToFirebaseAuth((user) => {
      setFirebaseUser(user);
      setAuthResolved(true);
      if (user) {
        setPendingPairing(null);
        setNotice(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void consumeGoogleRedirectResult()
      .catch((error) => {
        if (cancelled) return;
        setNotice({
          tone: 'danger',
          title: 'Google sign-in failed',
          detail: formatErrorMessage(error, 'Could not complete Google sign-in.'),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setRedirectResultResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    signedOutPairingMarkerRef.current = '';
  }, [settingsDraft.mirrorHttpBase]);

  const buildPairingHandoff = useCallback(
    (overrides?: Partial<PairingQueryState>): PairingQueryState =>
      mergePairingState(readPairingQueryFromWindow(), readPendingPairingHandoff(), overrides),
    [],
  );

  const handleSaveSettings = useCallback(() => {
    const next = persistDeviceSettingsDraft(settingsDraft);
    setSettingsDraft(next);
    setSettingsStatus({
      tone: 'success',
      label: 'Device settings saved',
      detail: 'These public mirror settings apply before and after sign-in.',
    });
    setShowSettings(false);
  }, [settingsDraft]);

  const handleGoogleSignIn = useCallback(async (handoff?: Partial<PairingQueryState>) => {
    const nextHandoff = buildPairingHandoff(handoff);
    if (hasPairingState(nextHandoff)) {
      persistPendingPairingHandoff(nextHandoff);
      if (nextHandoff.pairingCode) {
        setPendingPairing(
          buildPendingPairingView({
            provider: 'google',
            pairing_code: nextHandoff.pairingCode,
            status: nextHandoff.pairingId ? 'awaiting_app' : 'awaiting_oauth',
          }),
        );
      }
    }
    setSignInBusy(true);
    setNotice(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Google sign-in failed',
        detail: formatErrorMessage(error, 'Could not start Google sign-in.'),
      });
    } finally {
      setSignInBusy(false);
    }
  }, [buildPairingHandoff]);

  const exchangeSignedOutPairing = useCallback(
    async (handoff: PairingQueryState) => {
      const base = settingsDraft.mirrorHttpBase.trim();
      if (!base) {
        setNotice({
          tone: 'warning',
          title: 'Mirror settings are required',
          detail: 'Set the mirror HTTP base before finishing a pairing redirect on this device.',
        });
        setShowSettings(true);
        return;
      }
      if (!handoff.pairingId || !handoff.pairingCode) return;

      setPairingBusy(true);
      setNotice(null);
      setPendingPairing(
        buildPendingPairingView({
          provider: 'google',
          pairing_code: handoff.pairingCode,
          status: 'authorized',
        }),
      );
      try {
        const exchange = await mirrorExchangeAuthPairingToken(base, handoff.pairingId, {
          pairing_code: handoff.pairingCode,
        });
        await signInWithFirebaseCustomToken(exchange.custom_token);
        clearPairingQueryFromWindow();
        clearPendingPairingHandoff();
      } catch (error) {
        if (isFatalPairingError(error)) {
          clearPairingQueryFromWindow();
          clearPendingPairingHandoff();
        }
        setNotice({
          tone: 'danger',
          title: 'Could not finish pairing',
          detail: formatErrorMessage(error, 'The mirror pairing could not be completed on this device.'),
        });
      } finally {
        setPairingBusy(false);
      }
    },
    [settingsDraft.mirrorHttpBase],
  );

  const handleRedeemPairingCode = useCallback(async () => {
    const base = settingsDraft.mirrorHttpBase.trim();
    if (!base) {
      setNotice({
        tone: 'warning',
        title: 'Mirror settings are required',
        detail: 'Set the mirror HTTP base before redeeming a pairing code.',
      });
      setShowSettings(true);
      return;
    }
    if (!pairingCode.trim()) return;

    const handoff = buildPairingHandoff({
      pairingCode: normalizePairingCode(pairingCode),
    });

    persistPendingPairingHandoff(handoff);
    if (handoff.pairingId) {
      await exchangeSignedOutPairing(handoff);
      return;
    }

    setNotice({
      tone: 'neutral',
      title: 'Google sign-in required first',
      detail: 'This backend redeems manual pairing codes after Firebase sign-in. Continue with Google and the app will finish linking when you return.',
    });
    await handleGoogleSignIn(handoff);
  }, [buildPairingHandoff, exchangeSignedOutPairing, handleGoogleSignIn, pairingCode, settingsDraft.mirrorHttpBase]);

  useEffect(() => {
    if (!redirectResultResolved || firebaseUser) return;

    const handoff = buildPairingHandoff();
    if (handoff.pairingCode && handoff.pairingCode !== pairingCode) {
      setPairingCode(handoff.pairingCode);
    }
    if (!hasPairingState(handoff)) return;

    const marker = `${handoff.pairingId}:${handoff.pairingCode}`;
    if (signedOutPairingMarkerRef.current === marker) return;
    signedOutPairingMarkerRef.current = marker;

    persistPendingPairingHandoff(handoff);
    setPendingPairing(
      buildPendingPairingView({
        provider: 'google',
        pairing_code: handoff.pairingCode || undefined,
        status: handoff.pairingId && handoff.pairingCode ? 'authorized' : 'awaiting_oauth',
      }),
    );

    if (handoff.pairingId && handoff.pairingCode) {
      void exchangeSignedOutPairing(handoff);
      return;
    }

    setNotice({
      tone: 'neutral',
      title: 'Finish with Google on this device',
      detail: 'This pairing needs a Firebase session before it can be redeemed here. Continue with Google and the app will complete the backend finalize flow after sign-in.',
    });
  }, [buildPairingHandoff, exchangeSignedOutPairing, firebaseUser, pairingCode, redirectResultResolved]);

  const handleSignOut = useCallback(async () => {
    try {
      if (firebaseUser) {
        clearLayoutCache(firebaseUser.uid);
      }
      await signOutFromFirebase();
      clearPairingQueryFromWindow();
      clearPendingPairingHandoff();
      setPairingCode('');
      setPendingPairing(null);
      setNotice({
        tone: 'neutral',
        title: 'Signed out',
        detail: 'Mirror data is hidden until someone signs in again.',
      });
    } catch (error) {
      toast.error(formatErrorMessage(error, 'Could not sign out.'));
    }
  }, [firebaseUser]);

  const settingsSummary = useMemo(
    () => ({
      configured: Boolean(settingsDraft.mirrorHttpBase.trim() && settingsDraft.hardwareId.trim()),
      mirrorHttpBase: settingsDraft.mirrorHttpBase.trim() || undefined,
      hardwareId: settingsDraft.hardwareId.trim() || undefined,
    }),
    [settingsDraft.hardwareId, settingsDraft.mirrorHttpBase],
  );

  const authReady = authResolved && redirectResultResolved;

  if (!authReady || !firebaseUser) {
    return (
      <>
        <Toaster theme="dark" position="top-center" />
        <PrivateLoginGate
          mode={authReady ? 'signed_out' : 'loading'}
          pairingCode={pairingCode}
          onPairingCodeChange={setPairingCode}
          onRedeemPairingCode={() => void handleRedeemPairingCode()}
          onGoogleSignIn={() => void handleGoogleSignIn()}
          onOpenSettings={() => setShowSettings(true)}
          signInBusy={signInBusy}
          signInDisabled={pairingBusy}
          pairingBusy={pairingBusy}
          notice={notice}
          pendingPairing={pendingPairing}
          settingsSummary={settingsSummary}
        />
        <PublicMirrorSettingsModal
          open={showSettings}
          draft={settingsDraft}
          onDraftChange={setSettingsDraft}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          status={settingsStatus}
        />
      </>
    );
  }

  return (
    <AuthenticatedApp
      key={firebaseUser.uid}
      firebaseUser={firebaseUser}
      onSignOut={handleSignOut}
    />
  );
}
