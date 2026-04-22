'use client';
import { useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { derivePositionFromChain } from '@kast/orchestrator';
import { BASE_USDC } from '@kast/shared';
import { basePublicClient } from '../lib/chain.js';
import { sharedKamino } from '../lib/adapters.js';
import { useKastStore } from '../lib/store.js';
import { readPendingOrders } from '../lib/persistence.js';
import { usePendingOrderPoller } from '../lib/usePendingOrderPoller.js';
import { Header } from '../components/Header.js';
import { SideNav } from '../components/SideNav.js';
import { PositionHero } from '../components/PositionHero.js';
import { OpenFlow } from '../components/OpenFlow.js';
import { CloseFlow } from '../components/CloseFlow.js';
import { ActivityLog } from '../components/ActivityLog.js';
import { BalancesPanel } from '../components/BalancesPanel.js';
import { Login } from '../components/Login.js';

const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export default function Page() {
  const { ready, authenticated } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const setState = useKastStore((s) => s.setState);
  const setObligation = useKastStore((s) => s.setObligation);
  usePendingOrderPoller();

  // Privy returns a new wallets array on every render; depend on the stable
  // address strings so this initial-derive effect fires only when the wallet
  // identity actually changes — not after every user action. Otherwise it
  // stomps optimistic FSM transitions (e.g. IDLE set after WITHDRAW) with a
  // stale Kamino-cached obligation.
  const solAddress = solWallets[0]?.address;
  const evmAddress = evmWallets[0]?.address as `0x${string}` | undefined;

  useEffect(() => {
    if (!authenticated || !solAddress || !evmAddress) return;
    // Wallet identity can change (logout, account switch) while a derive is
    // still inflight. Guard so a stale resolution doesn't stomp the new
    // session's optimistic state.
    let canceled = false;

    (async () => {
      const kamino = sharedKamino();
      // Force a fresh market/reserve snapshot so the obligation we derive
      // state from reflects the chain, not a cached read.
      await kamino.reload();
      if (canceled) return;
      const obligation = await kamino.getObligation(new PublicKey(solAddress));
      if (canceled) return;
      const baseUsdc = await basePublicClient()
        .readContract({
          address: BASE_USDC as `0x${string}`,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [evmAddress],
        })
        .catch(() => 0n);
      if (canceled) return;
      const pendingOrders = readPendingOrders();
      setObligation(obligation);
      setState(derivePositionFromChain({ obligation, baseUsdc, pendingOrders }));
    })().catch((err) => {
      // Public Base RPC (mainnet.base.org) rate-limits aggressively. Log as
      // a warning so Next.js dev-overlay doesn't escalate it to an error.
      if (!canceled) console.warn('initial state derive failed', err);
    });

    return () => {
      canceled = true;
    };
  }, [authenticated, solAddress, evmAddress, setState, setObligation]);

  if (!ready || !authenticated) return <Login />;

  const baseAddress = evmAddress ?? null;

  return (
    <>
      <Header />
      <SideNav />
      <main className="pt-28 md:pl-64 pr-6 md:pr-10 pb-20">
        <PositionHero baseAddress={baseAddress} />
        <div className="max-w-6xl mx-auto mb-6">
          <BalancesPanel />
        </div>
        <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6">
          <OpenFlow />
          <CloseFlow />
        </div>
        <div className="max-w-6xl mx-auto mt-6">
          <ActivityLog />
        </div>
      </main>
    </>
  );
}
