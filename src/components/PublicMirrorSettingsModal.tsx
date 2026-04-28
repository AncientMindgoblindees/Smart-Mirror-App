import { AnimatePresence, motion } from 'motion/react';
import { Loader2, RotateCcw, Save, Settings2, Shield, Wifi, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type PublicMirrorSettingsDraft = {
  mirrorHttpBase: string;
  wsUrl: string;
  hardwareId: string;
  hardwareToken: string;
};

export type PublicMirrorSettingsStatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export type PublicMirrorSettingsStatus = {
  tone: PublicMirrorSettingsStatusTone;
  label: string;
  detail?: string;
};

export type PublicMirrorSettingsModalProps = {
  open: boolean;
  draft: PublicMirrorSettingsDraft;
  onDraftChange: (next: PublicMirrorSettingsDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onResetDefaults?: () => void;
  busy?: boolean;
  saveDisabled?: boolean;
  title?: string;
  description?: string;
  status?: PublicMirrorSettingsStatus | null;
};

function fieldToneClasses(tone: PublicMirrorSettingsStatusTone): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    case 'warning':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-50';
    case 'danger':
      return 'border-rose-400/30 bg-rose-500/10 text-rose-50';
    default:
      return 'border-white/10 bg-white/[0.04] text-white/75';
  }
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  helper,
  sensitive = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  helper: string;
  sensitive?: boolean;
}) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
          {label}
        </span>
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={sensitive ? 'password' : 'text'}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--color-accent)]/60 focus:bg-black/40"
      />
      <p className="text-xs text-white/35">{helper}</p>
    </label>
  );
}

export function PublicMirrorSettingsModal({
  open,
  draft,
  onDraftChange,
  onClose,
  onSave,
  onResetDefaults,
  busy = false,
  saveDisabled = false,
  title = 'Mirror connection settings',
  description = 'These are device-level settings. They can be changed before sign-in and apply to whoever uses this browser on this mirror.',
  status = null,
}: PublicMirrorSettingsModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-xl md:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#08111a]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative overflow-hidden border-b border-white/10 px-6 py-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,225,217,0.16),transparent_40%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.14),transparent_42%)]" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/55">
                    <Settings2 size={14} />
                    Public device settings
                  </div>
                  <div>
                    <h2 className="font-[var(--font-display)] text-2xl text-white">{title}</h2>
                    <p className="mt-2 max-w-xl text-sm text-white/60">{description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Close settings"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid gap-6 px-6 py-6 md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <LabeledInput
                  label="Mirror HTTP base"
                  value={draft.mirrorHttpBase}
                  onChange={(mirrorHttpBase) => onDraftChange({ ...draft, mirrorHttpBase })}
                  placeholder="http://127.0.0.1:8002"
                  helper="Used for REST APIs like session bootstrap, providers, and pairing redemption."
                />
                <LabeledInput
                  label="WebSocket URL"
                  value={draft.wsUrl}
                  onChange={(wsUrl) => onDraftChange({ ...draft, wsUrl })}
                  placeholder="ws://127.0.0.1:8002/ws/control"
                  helper="Used after sign-in for live mirror sync and status updates."
                />
                <LabeledInput
                  label="Hardware ID"
                  value={draft.hardwareId}
                  onChange={(hardwareId) => onDraftChange({ ...draft, hardwareId })}
                  placeholder="mirror-living-room"
                  helper="Identifies which physical mirror this browser is configuring."
                />
                <LabeledInput
                  label="Hardware token"
                  value={draft.hardwareToken}
                  onChange={(hardwareToken) => onDraftChange({ ...draft, hardwareToken })}
                  placeholder="Mirror token"
                  helper="Keeps device association separate from personal sign-in."
                  sensitive
                />
              </div>

              <div className="space-y-4">
                <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center gap-3 text-white">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-[var(--color-accent)]">
                      <Shield size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Privacy-first by default</h3>
                      <p className="mt-1 text-xs text-white/45">
                        These settings are shared device config only. User identity must come from Firebase sign-in.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center gap-3 text-white">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-[var(--color-cool)]">
                      <Wifi size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Before sign-in</h3>
                      <p className="mt-1 text-xs text-white/45">
                        Configure the mirror connection first, then continue with Google sign-in or pairing code redemption.
                      </p>
                    </div>
                  </div>
                </section>

                {status ? (
                  <section className={cn('rounded-3xl border p-4', fieldToneClasses(status.tone))}>
                    <p className="text-sm font-semibold">{status.label}</p>
                    {status.detail ? <p className="mt-1 text-xs opacity-80">{status.detail}</p> : null}
                  </section>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-white/35">
                <Shield size={14} />
                Device settings stay separate from user-scoped mirror data.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {onResetDefaults ? (
                  <button
                    type="button"
                    onClick={onResetDefaults}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw size={16} />
                    Reset defaults
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saveDisabled || busy}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save device settings
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
