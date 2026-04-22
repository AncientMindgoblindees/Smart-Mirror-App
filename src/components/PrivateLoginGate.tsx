import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  LogIn,
  QrCode,
  Settings2,
  Shield,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';

export type PrivateLoginGateMode = 'loading' | 'signed_out';

export type PrivateLoginGateNoticeTone = 'neutral' | 'success' | 'warning' | 'danger';

export type PrivateLoginGateNotice = {
  tone: PrivateLoginGateNoticeTone;
  title: string;
  detail?: string;
};

export type PrivateLoginGatePendingPairing = {
  providerLabel?: string;
  code?: string;
  expiresAtLabel?: string;
  statusLabel?: string;
  instructions?: string[];
};

export type PrivateLoginGateSettingsSummary = {
  configured: boolean;
  mirrorHttpBase?: string;
  hardwareId?: string;
};

export type PrivateLoginGateProps = {
  mode: PrivateLoginGateMode;
  title?: string;
  subtitle?: string;
  appName?: string;
  pairingCode: string;
  onPairingCodeChange: (value: string) => void;
  onRedeemPairingCode?: () => void;
  onGoogleSignIn?: () => void;
  onOpenSettings?: () => void;
  signInBusy?: boolean;
  signInDisabled?: boolean;
  pairingBusy?: boolean;
  pairingDisabled?: boolean;
  notice?: PrivateLoginGateNotice | null;
  pendingPairing?: PrivateLoginGatePendingPairing | null;
  settingsSummary?: PrivateLoginGateSettingsSummary | null;
  footerNote?: string;
};

function noticeToneClasses(tone: PrivateLoginGateNoticeTone): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50';
    case 'warning':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-50';
    case 'danger':
      return 'border-rose-400/30 bg-rose-500/10 text-rose-50';
    default:
      return 'border-white/10 bg-white/[0.04] text-white/75';
  }
}

export function PrivateLoginGate({
  mode,
  title = 'Private mirror access',
  subtitle = 'Sign in with Google to unlock your personal mirror data, or redeem a pairing code from the mirror to finish account setup.',
  appName = 'Smart Mirror',
  pairingCode,
  onPairingCodeChange,
  onRedeemPairingCode,
  onGoogleSignIn,
  onOpenSettings,
  signInBusy = false,
  signInDisabled = false,
  pairingBusy = false,
  pairingDisabled = false,
  notice = null,
  pendingPairing = null,
  settingsSummary = null,
  footerNote = 'This device should never assume who you are. Mirror hardware settings stay public; your account data does not.',
}: PrivateLoginGateProps) {
  const loading = mode === 'loading';
  const settingsConfigured = settingsSummary?.configured ?? false;

  return (
    <div className="min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,225,217,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.2),transparent_35%),linear-gradient(180deg,#06111a_0%,#02060b_100%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-white/55">
            <Sparkles size={14} />
            {appName}
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/75 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Settings2 size={16} />
            Mirror settings
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.section
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.05] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
          >
            <div className="border-b border-white/10 px-6 py-6 sm:px-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/50">
                <Lock size={14} />
                Login required
              </div>
              <h1 className="mt-4 font-[var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">{subtitle}</p>
            </div>

            <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-[var(--color-accent)]">
                      {loading || signInBusy ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <LogIn size={20} />
                      )}
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-white">
                        {loading ? 'Checking your sign-in state' : 'Continue with Google'}
                      </h2>
                      <p className="mt-2 text-sm text-white/55">
                        {loading
                          ? 'Hold on while we confirm whether this browser already has a secure session.'
                          : 'Your Firebase session becomes the only source of truth for who can see and manage mirror data.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    disabled={loading || signInBusy || signInDisabled}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading || signInBusy ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                    {loading ? 'Loading session' : 'Sign in with Google'}
                  </button>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-[var(--color-cool)]">
                      {pairingBusy ? <Loader2 size={20} className="animate-spin" /> : <QrCode size={20} />}
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-white">Redeem a pairing code</h2>
                      <p className="mt-2 text-sm text-white/55">
                        Use this when account setup started from the mirror screen or a QR code on the device.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={pairingCode}
                      onChange={(event) =>
                        onPairingCodeChange(event.target.value.replace(/\s+/g, '').toUpperCase())
                      }
                      placeholder="Enter pairing code"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--color-accent)]/60 focus:bg-white/[0.06]"
                    />
                    <button
                      type="button"
                      onClick={onRedeemPairingCode}
                      disabled={loading || pairingBusy || pairingDisabled || !pairingCode.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pairingBusy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                      Redeem code
                    </button>
                  </div>

                  <div className="mt-4 flex items-start gap-2 text-xs text-white/40">
                    <Smartphone size={14} className="mt-0.5 shrink-0" />
                    Mirror-only QR flows should finish here before the app signs in as that person.
                  </div>
                </div>

                {notice ? (
                  <div className={cn('rounded-[24px] border p-4', noticeToneClasses(notice.tone))}>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{notice.title}</p>
                        {notice.detail ? <p className="mt-1 text-xs opacity-85">{notice.detail}</p> : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">
                    Public device status
                  </p>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/35">Mirror connection</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {settingsConfigured ? 'Configured' : 'Needs setup'}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        {settingsSummary?.mirrorHttpBase || 'Set your mirror HTTP base before pairing or sign-in.'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/35">Hardware ID</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {settingsSummary?.hardwareId || 'Not configured yet'}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        Device identity stays separate from personal Firebase identity.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">
                    Pairing flow
                  </p>
                  {pendingPairing ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/8 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/40">Active pairing</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {pendingPairing.providerLabel || 'Account linking'}
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Code</p>
                            <p className="mt-1 font-[var(--font-mono)] text-base text-white">
                              {pendingPairing.code || 'Waiting for code'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Status</p>
                            <p className="mt-1 text-sm text-white">{pendingPairing.statusLabel || 'Awaiting redemption'}</p>
                          </div>
                        </div>
                        {pendingPairing.expiresAtLabel ? (
                          <p className="mt-3 text-xs text-white/45">Expires {pendingPairing.expiresAtLabel}</p>
                        ) : null}
                      </div>

                      {pendingPairing.instructions?.length ? (
                        <ol className="space-y-2 text-sm text-white/62">
                          {pendingPairing.instructions.map((step, index) => (
                            <li key={`${step}-${index}`} className="flex gap-3">
                              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-semibold">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-white/55">
                          Start from the mirror, then return here to redeem the code and finish secure sign-in.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-white/55">
                      No active pairing yet. Start linking from the mirror or scan a QR code to see the live pairing state here.
                    </p>
                  )}
                </section>

                <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-sm text-white/65">{footerNote}</p>
                </section>
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
