'use client';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { Icon } from './Icon.js';
import { WalletPill } from './WalletPill.js';

const NAV = [
  { label: 'Dashboard', active: true, soon: false },
  { label: 'Markets', active: false, soon: true },
  { label: 'Governance', active: false, soon: true },
  { label: 'History', active: false, soon: true },
];

export function Header() {
  const { logout, authenticated } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const sol = solWallets[0]?.address;
  const evm = evmWallets[0]?.address;

  return (
    <header className="fixed top-0 w-full z-50 bg-surface flex justify-between items-center px-10 py-6 border-b border-outline-variant/5">
      <div className="flex items-center gap-12">
        <span className="text-2xl font-black tracking-tighter text-tertiary">KAST</span>
        <nav className="hidden md:flex gap-8">
          {NAV.map((n) => (
            <span
              key={n.label}
              className={
                n.active
                  ? 'text-primary-container border-b border-primary-container pb-1 font-medium tracking-tight text-sm uppercase'
                  : 'text-secondary/50 cursor-not-allowed font-medium tracking-tight text-sm uppercase flex items-center gap-1'
              }
              title={n.soon ? 'Coming soon' : undefined}
            >
              {n.label}
              {n.soon && (
                <span className="font-technical text-[9px] tracking-widest text-outline ml-1">
                  · SOON
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {authenticated && <WalletPill kind="solana" address={sol} />}
        {authenticated && <WalletPill kind="base" address={evm} />}
        {authenticated && (
          <button
            onClick={() => void logout()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-on-surface hover:text-primary-container transition-colors"
          >
            <Icon name="logout" className="text-base" />
            Log out
          </button>
        )}
      </div>
    </header>
  );
}
