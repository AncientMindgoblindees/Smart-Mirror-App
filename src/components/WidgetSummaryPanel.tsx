import { RefreshCw, Loader2, Trash2 } from 'lucide-react';
import type { Widget } from '../lib/mirrorLayout';
import { cn } from '../lib/utils';

export type HttpSyncState = 'idle' | 'pulling' | 'pushing' | 'saved' | 'error';

function formatLayoutPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function WidgetSummaryPanel({
  widgets,
  mirrorHttpBase,
  httpSyncState,
  onRefreshFromMirror,
  onRemoveWidget,
}: {
  widgets: Widget[];
  mirrorHttpBase: string;
  httpSyncState: HttpSyncState;
  onRefreshFromMirror: () => void;
  onRemoveWidget: (widgetId: string) => void;
}) {
  const restEnabled = !!mirrorHttpBase.trim();
  const busy = httpSyncState === 'pulling' || httpSyncState === 'pushing';

  const statusLabel =
    !restEnabled
      ? 'REST off — layout via WebSocket when connected; still saved locally'
      : httpSyncState === 'pulling'
        ? 'Loading from mirror…'
        : httpSyncState === 'pushing'
          ? 'Saving to mirror…'
          : httpSyncState === 'saved'
            ? 'In sync with mirror'
            : httpSyncState === 'error'
              ? 'Last mirror request failed (using canvas / cache)'
              : 'Connected — edits save to mirror';

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold">Widgets on mirror</h2>
          <p className="text-[11px] text-white/45 mt-1">{statusLabel}</p>
        </div>
        <button
          type="button"
          disabled={!restEnabled || busy}
          onClick={onRefreshFromMirror}
          className={cn(
            'flex items-center gap-2 text-[11px] uppercase tracking-wider font-medium px-3 py-2 rounded-xl border transition-colors',
            restEnabled && !busy
              ? 'border-white/20 text-white/80 hover:bg-white/10'
              : 'border-white/5 text-white/25 cursor-not-allowed'
          )}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh from mirror
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-white/35 border-b border-white/10">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Widget ID</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Position</th>
              <th className="px-4 py-2 font-semibold">Size</th>
              <th className="px-4 py-2 font-semibold w-px" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {widgets.map((w) => (
              <tr key={w.id} className="border-b border-white/[0.06] last:border-0 text-white/85">
                <td className="px-4 py-2.5 font-medium">{w.name}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-white/60">{w.id}</td>
                <td className="px-4 py-2.5 text-white/55">{w.type === 'custom' ? 'custom' : 'builtin'}</td>
                <td className="px-4 py-2.5 tabular-nums text-white/70">
                  {formatLayoutPct(w.x)}%, {formatLayoutPct(w.y)}%
                </td>
                <td className="px-4 py-2.5 tabular-nums text-white/70">
                  {formatLayoutPct(w.width)}% × {formatLayoutPct(w.height)}%
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onRemoveWidget(w.id)}
                    className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
                    title="Remove widget"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
