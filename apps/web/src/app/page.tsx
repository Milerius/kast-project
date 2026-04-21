'use client';
import { useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { derivePositionFromChain } from '@kast/orchestrator';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { solanaConnection, basePublicClient } from '../lib/chain.js';
import { useKastStore } from '../lib/store.js';
import { readPendingOrders } from '../lib/persistence.js';
import { BASE_USDC } from '@kast/shared';
import { OpenFlow } from '../components/OpenFlow.js';
import { CloseFlow } from '../components/CloseFlow.js';
import { PositionCard } from '../components/PositionCard.js';
import { ActivityLog } from '../components/ActivityLog.js';
import { BaseEthPreflight } from '../components/BaseEthPreflight.js';

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
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const setState = useKastStore((s) => s.setState);

  useEffect(() => {
    if (!authenticated) return;
    const sol = solWallets[0];
    const evm = evmWallets[0];
    if (!sol || !evm) return;

    (async () => {
      const kamino = createKaminoAdapter({
        connection: solanaConnection(),
        marketAddress: new PublicKey(process.env.NEXT_PUBLIC_KAMINO_MARKET ?? ''),
      });
      const obligation = await kamino.getObligation(new PublicKey(sol.address));
      const baseUsdc = await basePublicClient().readContract({
        address: BASE_USDC as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [evm.address as `0x${string}`],
      });
      const pendingOrders = readPendingOrders();
      setState(derivePositionFromChain({ obligation, baseUsdc, pendingOrders }));
    })().catch(console.error);
  }, [authenticated, solWallets, evmWallets, setState]);

  if (!ready) return <main className="p-8">Loading…</main>;

  return (
    <main className="p-8 space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KAST DeFi</h1>
        {authenticated ? (
          <button onClick={() => void logout()}>Log out</button>
        ) : (
          <button onClick={login}>Log in</button>
        )}
      </header>
      {authenticated && (
        <>
          <PositionCard />
          <BaseEthPreflight
            baseAddress={(evmWallets[0]?.address as `0x${string}` | undefined) ?? null}
          />
          <OpenFlow />
          <CloseFlow />
          <ActivityLog />
        </>
      )}
    </main>
  );
}
