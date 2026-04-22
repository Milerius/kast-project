'use client';
import { useState } from 'react';
import { Icon } from './Icon.js';

export function WalletPill({
  kind,
  address,
}: {
  kind: 'solana' | 'base';
  address: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  const truncated =
    kind === 'base'
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : `${address.slice(0, 4)}…${address.slice(-4)}`;
  const icon = kind === 'solana' ? 'account_balance_wallet' : 'link';
  async function copy() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  }
  return (
    <button
      onClick={() => void copy()}
      title={`Copy ${kind === 'solana' ? 'Solana' : 'Base'} address`}
      className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high transition-colors rounded-full px-4 py-2 border border-outline-variant/10"
    >
      <Icon name={copied ? 'check' : icon} className="text-sm text-secondary" />
      <span className="font-technical text-xs tracking-wider">{copied ? 'Copied' : truncated}</span>
    </button>
  );
}
