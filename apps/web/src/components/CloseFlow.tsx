'use client';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallets } from '@privy-io/react-auth';
import { useSolanaWallets, useSendTransaction } from '@privy-io/react-auth/solana';
import { canFire, transition } from '@kast/orchestrator';
import { DEFAULT_BORROW_USDC_UNITS, USDC_BASE_UNITS, type PersistedOrder } from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter } from '@kast/mayan-adapter';
import { solanaConnection } from '../lib/chain.js';
import { useKastStore } from '../lib/store.js';
import { env } from '../lib/env.js';

export function CloseFlow() {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { state, setState, pushLog, trackOrder, untrackOrder, pendingOrders } = useKastStore();
  const [partial, setPartial] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const solWallet = solWallets[0];
  const evmWallet = evmWallets[0];
  if (!solWallet || !evmWallet) return null;

  const connection = solanaConnection();
  const kamino = createKaminoAdapter({
    connection,
    marketAddress: new PublicKey(process.env.NEXT_PUBLIC_KAMINO_MARKET ?? ''),
  });
  const referrer = env.mayanReferrer();
  const mayan = createMayanAdapter({
    solanaConnection: connection,
    ...(referrer !== undefined && { referrer }),
  });

  async function pollOrder(hash: string) {
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const status = await mayan.getOrderStatus(hash);
      if (status === 'SETTLED' || status === 'REFUNDED') {
        untrackOrder(hash);
        pushLog({ message: `Order ${hash.slice(0, 10)}… ${status}` });
        return status;
      }
    }
  }

  async function onBridgeBack() {
    setBusy(true);
    try {
      const amt = partial
        ? BigInt(Math.round(parseFloat(partial) * Number(USDC_BASE_UNITS)))
        : DEFAULT_BORROW_USDC_UNITS;
      const q = await mayan.quote({
        fromChain: 'base',
        toChain: 'solana',
        amountUsdc: amt,
        fromAddress: evmWallet!.address,
        toAddress: solWallet!.address,
      });
      const bundle = await mayan.buildBridgeTx(q);
      if (bundle.chain !== 'base') throw new Error('expected base bundle');
      const order: PersistedOrder = {
        orderHash: bundle.orderHash,
        direction: 'back',
        amountUsdc: amt.toString(),
        startedAt: Date.now(),
      };
      trackOrder(order);
      const provider = await evmWallet!.getEthereumProvider();
      for (const tx of bundle.txs) {
        const hash = (await provider.request({
          method: 'eth_sendTransaction',
          params: [{ to: tx.to, data: tx.data, value: `0x${tx.value.toString(16)}` }],
        })) as string;
        pushLog({ message: 'EVM tx submitted', sig: hash });
      }
      setState(
        transition(state, {
          type: 'BRIDGE_BACK',
          amountUsdc: amt,
          orderHash: bundle.orderHash,
        }),
      );
      const status = await pollOrder(bundle.orderHash);
      if (status === 'SETTLED') {
        setState(transition(state, { type: 'BRIDGE_SETTLED' }));
      } else {
        setState(transition(state, { type: 'BRIDGE_REFUND' }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRepay() {
    setBusy(true);
    try {
      const amount: bigint | 'all' = partial
        ? BigInt(Math.round(parseFloat(partial) * Number(USDC_BASE_UNITS)))
        : 'all';
      const [tx] = await kamino.buildRepayTx({
        owner: new PublicKey(solWallet!.address),
        amount,
      });
      if (!tx) throw new Error('No tx');
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: `Repay ${amount === 'all' ? 'all' : amount}`, sig: result.signature });
      setState(transition(state, { type: 'REPAY', amount }));
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    try {
      const [tx] = await kamino.buildWithdrawCollateralTx({
        owner: new PublicKey(solWallet!.address),
        lamports: 'all',
      });
      if (!tx) throw new Error('No tx');
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Withdraw all collateral', sig: result.signature });
      setState(transition(state, { type: 'WITHDRAW', lamports: 'all' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">Close</h2>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={partial}
          onChange={(e) => setPartial(e.target.value)}
          placeholder="Partial USDC (blank = max)"
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        />
        <button
          disabled={busy || !canFire(state, 'BRIDGE_BACK')}
          onClick={() => void onBridgeBack()}
        >
          4. Bridge back
        </button>
        <button disabled={busy || !canFire(state, 'REPAY')} onClick={() => void onRepay()}>
          5. Repay
        </button>
        <button disabled={busy || !canFire(state, 'WITHDRAW')} onClick={() => void onWithdraw()}>
          6. Withdraw
        </button>
      </div>
      {pendingOrders.length > 0 && (
        <p className="text-xs opacity-60">
          Pending orders: {pendingOrders.map((o) => o.orderHash.slice(0, 8)).join(', ')}
        </p>
      )}
    </section>
  );
}
