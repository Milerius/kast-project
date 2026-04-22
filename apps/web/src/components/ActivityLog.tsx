'use client';
import { useKastStore, type LogEntry } from '../lib/store.js';
import { Icon } from './Icon.js';

function hrefFor(e: LogEntry): string | null {
  if (!e.sig) return null;
  if (e.chain === 'base') return `https://basescan.org/tx/${e.sig}`;
  if (e.chain === 'mayan') return `https://explorer.mayan.finance/swap/${e.sig}`;
  return `https://solscan.io/tx/${e.sig}`;
}

function classifyEntry(message: string): { icon: string; tone: string } {
  const m = message.toLowerCase();
  if (m.includes('confirmed') || m.includes('settled'))
    return { icon: 'check_circle', tone: 'text-primary-container' };
  if (m.includes('refund') || m.includes('error') || m.includes('fail'))
    return { icon: 'error', tone: 'text-error' };
  if (m.includes('bridg')) return { icon: 'swap_horiz', tone: 'text-secondary' };
  if (m.includes('repay')) return { icon: 'payments', tone: 'text-on-surface' };
  if (m.includes('borrow')) return { icon: 'attach_money', tone: 'text-on-surface' };
  if (m.includes('deposit')) return { icon: 'download', tone: 'text-on-surface' };
  if (m.includes('withdraw')) return { icon: 'upload', tone: 'text-on-surface' };
  if (m.includes('submit') || m.includes('tx')) return { icon: 'bolt', tone: 'text-secondary' };
  return { icon: 'circle', tone: 'text-on-surface-variant' };
}

export function ActivityLog() {
  const log = useKastStore((s) => s.log);

  return (
    <div className="bg-surface-container-low rounded-3xl p-8 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-technical text-[10px] tracking-widest text-outline mb-1">
            MODULE 03
          </div>
          <h2 className="text-2xl font-black tracking-tight">Activity Log</h2>
        </div>
        <span className="font-technical text-[10px] tracking-widest text-on-surface-variant">
          {log.length} EVENT{log.length === 1 ? '' : 'S'}
        </span>
      </div>
      {log.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Icon name="history" className="text-4xl text-on-surface/20" />
          <p className="font-technical text-xs tracking-widest uppercase text-on-surface/40">
            No activity yet
          </p>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/10">
          {log
            .slice()
            .reverse()
            .map((e, i) => {
              const { icon, tone } = classifyEntry(e.message);
              const ts = new Date(e.at).toISOString().slice(11, 19);
              return (
                <div
                  key={i}
                  className="grid grid-cols-[auto_auto_1fr_auto] gap-4 items-center py-3"
                >
                  <Icon name={icon} className={`text-lg ${tone}`} />
                  <span className="font-technical text-[10px] tracking-widest text-outline">
                    {ts}
                  </span>
                  <span className="text-sm text-on-surface truncate">{e.message}</span>
                  {e.sig && (
                    <a
                      href={hrefFor(e) ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="font-technical text-[10px] tracking-widest text-primary-container hover:underline flex items-center gap-1"
                    >
                      {e.sig.slice(0, 8)}…
                      <Icon name="open_in_new" className="text-xs" />
                    </a>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
