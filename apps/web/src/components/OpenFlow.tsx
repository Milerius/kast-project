'use client';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallets } from '@privy-io/react-auth';
import { useSolanaWallets, useSendTransaction } from '@privy-io/react-auth/solana';
import { canFire, transition } from '@kast/orchestrator';
import {
  DEFAULT_BORROW_USDC_UNITS,
  TARGET_COLLATERAL_USD,
  type PersistedOrder,
} from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter } from '@kast/mayan-adapter';
import { solanaConnection } from '../lib/chain.js';
import { useKastStore } from '../lib/store.js';
import { env } from '../lib/env.js';
import { targetCollateralLamports } from '../lib/amounts.js';

export function OpenFlow() {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { state, setState, pushLog, trackOrder } = useKastStore();
  const [busy, setBusy] = useState(false);

  const solWallet = solWallets[0];
  const evmWallet = evmWallets[0];
  if (!solWallet || !evmWallet) return <p>Log in with Privy first.</p>;

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

  async function onDeposit() {
    setBusy(true);
    try {
      const solPrice = 150;
      const lamports = targetCollateralLamports(solPrice);
      pushLog({ message: `Deposit ${TARGET_COLLATERAL_USD} USD of SOL (${lamports} lamports)` });
      const [tx] = await kamino.buildDepositCollateralTx({
        owner: new PublicKey(solWallet!.address),
        lamports,
      });
      if (!tx) throw new Error('No tx returned');
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Deposit confirmed', sig: result.signature });
      setState(transition(state, { type: 'DEPOSIT', lamports }));
    } finally {
      setBusy(false);
    }
  }

  async function onBorrow() {
    setBusy(true);
    try {
      const [tx] = await kamino.buildBorrowTx({
        owner: new PublicKey(solWallet!.address),
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
      });
      if (!tx) throw new Error('No tx returned');
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Borrowed 5 USDC', sig: result.signature });
      setState(transition(state, { type: 'BORROW', amountUsdc: DEFAULT_BORROW_USDC_UNITS }));
    } finally {
      setBusy(false);
    }
  }

  async function onBridgeOut() {
    setBusy(true);
    try {
      const q = await mayan.quote({
        fromChain: 'solana',
        toChain: 'base',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
        fromAddress: solWallet!.address,
        toAddress: evmWallet!.address,
      });
      const bundle = await mayan.buildBridgeTx(q);
      const order: PersistedOrder = {
        orderHash: bundle.orderHash,
        direction: 'out',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS.toString(),
        startedAt: Date.now(),
      };
      trackOrder(order);
      pushLog({ message: `Bridging out — order ${bundle.orderHash.slice(0, 10)}…` });
      if (bundle.chain !== 'solana') throw new Error('expected solana bundle');
      const result = await sendTransaction({ transaction: bundle.txs[0], connection });
      pushLog({ message: 'Bridge tx submitted', sig: result.signature });
      setState(
        transition(state, {
          type: 'BRIDGE_OUT',
          amountUsdc: DEFAULT_BORROW_USDC_UNITS,
          orderHash: bundle.orderHash,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">Open</h2>
      <div className="flex gap-2">
        <button disabled={busy || !canFire(state, 'DEPOSIT')} onClick={() => void onDeposit()}>
          1. Deposit SOL
        </button>
        <button disabled={busy || !canFire(state, 'BORROW')} onClick={() => void onBorrow()}>
          2. Borrow 5 USDC
        </button>
        <button disabled={busy || !canFire(state, 'BRIDGE_OUT')} onClick={() => void onBridgeOut()}>
          3. Bridge to Base
        </button>
      </div>
    </section>
  );
}
