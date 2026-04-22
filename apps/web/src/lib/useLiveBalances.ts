'use client';
import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallets } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { BASE_USDC, SOLANA_USDC_MINT } from '@kast/shared';
import { basePublicClient } from './chain.js';
import { sharedConnection, sharedKamino } from './adapters.js';
import { useKastStore } from './store.js';

const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type LiveBalances = {
  solLamports: bigint | null;
  solUsdcBaseUnits: bigint | null;
  baseEthWei: bigint | null;
  baseUsdcBaseUnits: bigint | null;
  loading: boolean;
};

const EMPTY: LiveBalances = {
  solLamports: null,
  solUsdcBaseUnits: null,
  baseEthWei: null,
  baseUsdcBaseUnits: null,
  loading: true,
};

const REFRESH_MS = 15_000;

async function fetchSolUsdc(sol: string): Promise<bigint> {
  const res = await sharedConnection().getParsedTokenAccountsByOwner(new PublicKey(sol), {
    mint: new PublicKey(SOLANA_USDC_MINT),
  });
  return res.value.reduce((acc, t) => {
    const parsed = t.account.data.parsed as { info?: { tokenAmount?: { amount?: string } } };
    const amount = parsed.info?.tokenAmount?.amount ?? '0';
    return acc + BigInt(amount);
  }, 0n);
}

export function useLiveBalances(): LiveBalances {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const tick = useKastStore((s) => s.balanceRefreshTick);
  const setObligation = useKastStore((s) => s.setObligation);

  const sol = solWallets[0]?.address;
  const evm = evmWallets[0]?.address as `0x${string}` | undefined;
  const [bal, setBal] = useState<LiveBalances>(EMPTY);

  useEffect(() => {
    if (!sol || !evm) {
      setBal(EMPTY);
      return;
    }
    let canceled = false;

    async function fetchAll() {
      const connection = sharedConnection();
      const client = basePublicClient();
      const kamino = sharedKamino();
      const obligationOrErr = await kamino
        .getObligation(new PublicKey(sol!))
        .then((v) => ({ ok: true as const, v }))
        .catch((e: unknown) => ({ ok: false as const, e }));
      try {
        // Public Base RPC (mainnet.base.org) rate-limits aggressively; treat
        // any failure on Base reads as "unknown" so one 429 doesn't nuke the
        // whole balance refresh.
        const [solLamports, solUsdc, baseEth, baseUsdc] = await Promise.all([
          connection.getBalance(new PublicKey(sol!)),
          fetchSolUsdc(sol!).catch(() => 0n),
          client.getBalance({ address: evm! }).catch(() => 0n),
          client
            .readContract({
              address: BASE_USDC as `0x${string}`,
              abi: USDC_ABI,
              functionName: 'balanceOf',
              args: [evm!],
            })
            .catch(() => 0n),
        ]);
        if (canceled) return;
        setBal({
          solLamports: BigInt(solLamports),
          solUsdcBaseUnits: solUsdc,
          baseEthWei: baseEth,
          baseUsdcBaseUnits: baseUsdc,
          loading: false,
        });
        if (obligationOrErr.ok) setObligation(obligationOrErr.v);
      } catch (e) {
        if (canceled) return;
        console.warn('live balance fetch failed', e);
        setBal((b) => ({ ...b, loading: false }));
      }
    }

    void fetchAll();
    const interval = setInterval(() => void fetchAll(), REFRESH_MS);
    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [sol, evm, tick, setObligation]);

  return bal;
}
