'use client';
import { useKastStore } from '../lib/store.js';

export function PositionCard() {
  const state = useKastStore((s) => s.state);
  return (
    <div className="rounded border border-slate-700 p-4">
      <p className="text-sm opacity-60">Position state</p>
      <p className="text-2xl font-bold">{state}</p>
    </div>
  );
}
