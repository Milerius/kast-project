'use client';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallets } from '@privy-io/react-auth';
import { useSolanaWallets, useSendTransaction } from '@privy-io/react-auth/solana';
import { canFire, transition, type PositionState } from '@kast/orchestrator';
import {
  DEFAULT_BORROW_USDC_UNITS,
  TARGET_COLLATERAL_USD,
  type PersistedOrder,
} from '@kast/shared';
import { sharedConnection, sharedKamino, sharedMayan } from '../lib/adapters.js';
import { useKastStore } from '../lib/store.js';
import { targetCollateralLamports, formatSol } from '../lib/amounts.js';
import { usePriceSol } from '../lib/usePriceSol.js';
import { ActionCard } from './ActionCard.js';
import { explorerLinks } from '../lib/explorers.js';

type Slot = 'DEPOSIT' | 'BORROW' | 'BRIDGE_OUT';

function statusFor(
  state: PositionState,
  slot: Slot,
  busy: boolean,
): 'done' | 'active' | 'locked' | 'disabled' {
  if (busy && canFire(state, slot)) return 'active';
  const order: Slot[] = ['DEPOSIT', 'BORROW', 'BRIDGE_OUT'];
  const activeIdx = order.findIndex((s) => canFire(state, s));
  const slotIdx = order.indexOf(slot);
  if (activeIdx === -1) return slotIdx < order.length ? 'done' : 'disabled';
  if (slotIdx < activeIdx) return 'done';
  if (slotIdx === activeIdx) return 'active';
  return 'locked';
}

function freshState(): PositionState {
  return useKastStore.getState().state;
}

export function OpenFlow() {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const {
    state,
    setState,
    pushLog,
    trackOrder,
    setStepSig,
    resetStepSigs,
    bumpBalanceRefresh,
    stepSigs,
  } = useKastStore();
  const [busy, setBusy] = useState<Slot | null>(null);
  const solPrice = usePriceSol();

  const solWallet = solWallets[0];
  const evmWallet = evmWallets[0];
  if (!solWallet || !evmWallet) {
    return (
      <div className="bg-surface-container-low rounded-3xl p-8 border border-outline-variant/10">
        <p className="text-on-surface-variant">Connect your wallet to begin.</p>
      </div>
    );
  }

  const connection = sharedConnection();
  const kamino = sharedKamino();
  const mayan = sharedMayan();

  async function onDeposit() {
    setBusy('DEPOSIT');
    const prev = freshState();
    // Clear any step signatures left over from a previous cycle so close-flow
    // status labels don't show stale "done" entries when the next position opens.
    if (prev === 'IDLE') resetStepSigs();
    try {
      const lamports = targetCollateralLamports(solPrice);
      pushLog({
        message: `Deposit ~$${TARGET_COLLATERAL_USD} of SOL (${formatSol(lamports, 4)} SOL)`,
      });
      const [tx] = await kamino.buildDepositCollateralTx({
        owner: new PublicKey(solWallet!.address),
        lamports,
      });
      if (!tx) throw new Error('No tx returned');
      // Privy's Solana sendTransaction Promise does not resolve until the
      // user dismisses the "Transaction complete!" modal. Advance the FSM
      // optimistically so the state pill reflects intent immediately.
      setState(transition(prev, { type: 'DEPOSIT', lamports }));
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Deposit confirmed', sig: result.signature, chain: 'sol' });
      setStepSig('DEPOSIT', { kind: 'sol', sig: result.signature });
      bumpBalanceRefresh();
    } catch (err) {
      setState(prev);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function onBorrow() {
    setBusy('BORROW');
    const prev = freshState();
    try {
      const [tx] = await kamino.buildBorrowTx({
        owner: new PublicKey(solWallet!.address),
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
      });
      if (!tx) throw new Error('No tx returned');
      setState(transition(prev, { type: 'BORROW', amountUsdc: DEFAULT_BORROW_USDC_UNITS }));
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Borrowed 5 USDC', sig: result.signature, chain: 'sol' });
      setStepSig('BORROW', { kind: 'sol', sig: result.signature });
      bumpBalanceRefresh();
    } catch (err) {
      setState(prev);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function onBridgeOut() {
    setBusy('BRIDGE_OUT');
    const prev = freshState();
    try {
      const q = await mayan.quote({
        fromChain: 'solana',
        toChain: 'base',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
        fromAddress: solWallet!.address,
        toAddress: evmWallet!.address,
      });
      const bundle = await mayan.buildBridgeTx(q);
      if (bundle.chain !== 'solana') throw new Error('expected solana bundle');
      // Mayan ships a placeholder blockhash (11111…) since the SDK cannot
      // know when the caller will submit. Overwrite with a fresh one before
      // partial-signing ephemeral signers; LUT references stay intact.
      const tx = bundle.txs[0];
      const { blockhash } = await connection.getLatestBlockhash();
      tx.message.recentBlockhash = blockhash;
      if (bundle.extraSigners.length > 0) tx.sign(bundle.extraSigners);
      // The FSM transition only reads event.type; orderHash in the payload is
      // purely advisory. Advance optimistically so state becomes BRIDGING_OUT
      // before the modal blocks the await.
      setState(
        transition(prev, {
          type: 'BRIDGE_OUT',
          amountUsdc: DEFAULT_BORROW_USDC_UNITS,
          orderHash: bundle.orderHash ?? 'pending',
        }),
      );
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Bridge tx submitted', sig: result.signature, chain: 'mayan' });
      // Mayan explorer indexes by source tx sig; for SWIFT we also have a
      // pre-computed orderHash. Either works as a tracking key.
      const trackingKey = bundle.orderHash ?? result.signature;
      const order: PersistedOrder = {
        orderHash: trackingKey,
        direction: 'out',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS.toString(),
        startedAt: Date.now(),
      };
      trackOrder(order);
      pushLog({ message: `Bridging out (${bundle.route}) — ${trackingKey.slice(0, 10)}…` });
      setStepSig('BRIDGE_OUT', {
        kind: 'mayan',
        sourceChain: 'solana',
        sig: result.signature,
        orderHash: trackingKey,
      });
      bumpBalanceRefresh();
    } catch (err) {
      setState(prev);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  const lamports = targetCollateralLamports(solPrice);

  return (
    <div className="bg-surface-container-low rounded-3xl p-8 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-technical text-[10px] tracking-widest text-outline mb-1">
            MODULE 01
          </div>
          <h2 className="text-2xl font-black tracking-tight">Open Position</h2>
        </div>
        <span className="font-technical text-[10px] tracking-widest text-primary-container bg-primary-container/10 px-3 py-1 rounded-full">
          SOLANA → BASE
        </span>
      </div>
      <div className="space-y-3">
        <ActionCard
          index={1}
          icon="download"
          title="Deposit SOL as Collateral"
          subtitle={`${formatSol(lamports, 4)} SOL (~$${TARGET_COLLATERAL_USD}) → Kamino main market`}
          status={statusFor(state, 'DEPOSIT', busy === 'DEPOSIT')}
          busy={busy === 'DEPOSIT'}
          onClick={() => void onDeposit()}
          {...(stepSigs.DEPOSIT && { links: explorerLinks(stepSigs.DEPOSIT) })}
        />
        <ActionCard
          index={2}
          icon="attach_money"
          title="Borrow 5 USDC"
          subtitle="Against your SOL collateral"
          status={statusFor(state, 'BORROW', busy === 'BORROW')}
          busy={busy === 'BORROW'}
          onClick={() => void onBorrow()}
          {...(stepSigs.BORROW && { links: explorerLinks(stepSigs.BORROW) })}
        />
        <ActionCard
          index={3}
          icon="swap_horiz"
          title="Bridge USDC to Base"
          subtitle="via Mayan (FAST_MCTP)"
          status={statusFor(state, 'BRIDGE_OUT', busy === 'BRIDGE_OUT')}
          busy={busy === 'BRIDGE_OUT'}
          onClick={() => void onBridgeOut()}
          {...(stepSigs.BRIDGE_OUT && { links: explorerLinks(stepSigs.BRIDGE_OUT) })}
        />
      </div>
    </div>
  );
}
