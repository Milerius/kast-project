'use client';
import { useKastStore } from '../lib/store.js';

export function ActivityLog() {
  const log = useKastStore((s) => s.log);
  return (
    <ul className="font-mono text-xs space-y-1 max-h-64 overflow-auto bg-slate-900 p-3 rounded">
      {log.map((e, i) => (
        <li key={i}>
          <span className="opacity-60">{new Date(e.at).toISOString().slice(11, 19)}</span>{' '}
          {e.message}
          {e.sig ? <> sig={e.sig.slice(0, 12)}…</> : null}
        </li>
      ))}
      {log.length === 0 && <li className="opacity-60">No activity yet.</li>}
    </ul>
  );
}
