'use client';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallets } from '@privy-io/react-auth';
import { useSolanaWallets, useSendTransaction } from '@privy-io/react-auth/solana';
import { canFire, transition, type PositionState } from '@kast/orchestrator';
import { BASE_USDC, USDC_BASE_UNITS, type PersistedOrder } from '@kast/shared';
import { sharedConnection, sharedKamino, sharedMayan } from '../lib/adapters.js';
import { basePublicClient } from '../lib/chain.js';
import { useKastStore, type StepName, type StepSig } from '../lib/store.js';
import { ActionCard } from './ActionCard.js';
import { explorerLinks } from '../lib/explorers.js';

function freshState(): PositionState {
  return useKastStore.getState().state;
}

type Slot = 'BRIDGE_BACK' | 'REPAY' | 'WITHDRAW';

function statusFor(
  state: PositionState,
  slot: Slot,
  busy: boolean,
  stepSigs: Partial<Record<StepName, StepSig>>,
): 'done' | 'active' | 'locked' | 'disabled' {
  // The close flow isn't linear — DEPOSITED can shortcut straight to WITHDRAW
  // without bridging/repaying. So "done" must be anchored to whether the user
  // actually fired that step (stepSig recorded), not to FSM adjacency.
  if (busy) return 'active';
  if (stepSigs[slot]) return 'done';
  if (canFire(state, slot)) return 'active';
  return 'locked';
}

export function CloseFlow() {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const {
    state,
    setState,
    pushLog,
    trackOrder,
    pendingOrders,
    setStepSig,
    bumpBalanceRefresh,
    stepSigs,
  } = useKastStore();
  const [partial, setPartial] = useState<string>('');
  const [busy, setBusy] = useState<Slot | null>(null);

  const solWallet = solWallets[0];
  const evmWallet = evmWallets[0];
  if (!solWallet || !evmWallet) return null;

  const connection = sharedConnection();
  const kamino = sharedKamino();
  const mayan = sharedMayan();

  async function onBridgeBack() {
    setBusy('BRIDGE_BACK');
    const prev = freshState();
    try {
      const client = basePublicClient();
      // Bridge fees on the outbound leg consume a tiny amount of USDC, so the
      // balance on Base is usually slightly less than the originally-borrowed
      // amount. Use the live balance as the ceiling and let the user request
      // less via `partial`.
      const baseUsdc = await client.readContract({
        address: BASE_USDC as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'balanceOf',
            stateMutability: 'view',
            inputs: [{ name: 'a', type: 'address' }],
            outputs: [{ type: 'uint256' }],
          },
        ] as const,
        functionName: 'balanceOf',
        args: [evmWallet!.address as `0x${string}`],
      });
      const requested = partial
        ? BigInt(Math.round(parseFloat(partial) * Number(USDC_BASE_UNITS)))
        : baseUsdc;
      const amt = requested > baseUsdc ? baseUsdc : requested;
      if (amt === 0n) throw new Error('No USDC balance on Base to bridge back');
      const q = await mayan.quote({
        fromChain: 'base',
        toChain: 'solana',
        amountUsdc: amt,
        fromAddress: evmWallet!.address,
        toAddress: solWallet!.address,
      });
      const bundle = await mayan.buildBridgeTx(q);
      if (bundle.chain !== 'base') throw new Error('expected base bundle');
      // Advance FSM to BRIDGING_BACK before sending so the state pill reflects
      // intent immediately. orderHash payload is advisory — transition() reads
      // only event.type.
      setState(
        transition(prev, {
          type: 'BRIDGE_BACK',
          amountUsdc: amt,
          orderHash: bundle.orderHash ?? 'pending',
        }),
      );
      const provider = await evmWallet!.getEthereumProvider();
      // Privy's embedded wallet can drift back to Ethereum mainnet between
      // renders. Force Base before each send so the modal + RPC both target 8453.
      await provider
        .request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] })
        .catch(() => undefined);
      let bridgeSig: string | undefined;
      for (const tx of bundle.txs) {
        // Privy's embedded wallet defaults to a gas limit that's too low for
        // Mayan's swap ix. Estimate + 25% buffer so the tx doesn't revert
        // with "intrinsic gas too low".
        const estimated = await client
          .estimateGas({
            account: evmWallet!.address as `0x${string}`,
            to: tx.to,
            data: tx.data,
            value: tx.value,
          })
          .catch(() => 600_000n);
        const gas = (estimated * 125n) / 100n;
        const hash = (await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              to: tx.to,
              data: tx.data,
              value: `0x${tx.value.toString(16)}`,
              gas: `0x${gas.toString(16)}`,
            },
          ],
        })) as string;
        pushLog({ message: 'EVM tx submitted', sig: hash, chain: 'base' });
        // The second (swap) tx is the bridge-out; its hash is what the Mayan
        // explorer indexes by.
        bridgeSig = hash;
      }
      if (!bridgeSig) throw new Error('no bridge sig');
      const trackingKey = bundle.orderHash ?? bridgeSig;
      const order: PersistedOrder = {
        orderHash: trackingKey,
        direction: 'back',
        amountUsdc: amt.toString(),
        startedAt: Date.now(),
      };
      trackOrder(order);
      setStepSig('BRIDGE_BACK', {
        kind: 'mayan',
        sourceChain: 'base',
        sig: bridgeSig,
        orderHash: trackingKey,
      });
      bumpBalanceRefresh();
      // Settlement is handled by the app-level pending-order poller.
    } catch (err) {
      setState(prev);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function onRepay() {
    setBusy('REPAY');
    const prev = freshState();
    try {
      const amount: bigint | 'all' = partial
        ? BigInt(Math.round(parseFloat(partial) * Number(USDC_BASE_UNITS)))
        : 'all';
      const [tx] = await kamino.buildRepayTx({
        owner: new PublicKey(solWallet!.address),
        amount,
      });
      if (!tx) throw new Error('No tx');
      setState(transition(prev, { type: 'REPAY', amount }));
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({
        message: `Repay ${amount === 'all' ? 'all' : amount}`,
        sig: result.signature,
        chain: 'sol',
      });
      setStepSig('REPAY', { kind: 'sol', sig: result.signature });
      bumpBalanceRefresh();
    } catch (err) {
      setState(prev);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function onWithdraw() {
    setBusy('WITHDRAW');
    const prev = freshState();
    try {
      // The SDK caches reserve state from adapter init; after repay the
      // obligation no longer has a USDC borrow, but the cached snapshot still
      // lists it as a refresh account, which makes refresh_obligation revert
      // with InvalidAccountInput. Force a reload first.
      await kamino.reload();
      const [tx] = await kamino.buildWithdrawCollateralTx({
        owner: new PublicKey(solWallet!.address),
        lamports: 'all',
      });
      if (!tx) throw new Error('No tx');
      setState(transition(prev, { type: 'WITHDRAW', lamports: 'all' }));
      const result = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Withdraw all collateral', sig: result.signature, chain: 'sol' });
      setStepSig('WITHDRAW', { kind: 'sol', sig: result.signature });
      bumpBalanceRefresh();
    } catch (err) {
      setState(prev);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-surface-container-low rounded-3xl p-8 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-technical text-[10px] tracking-widest text-outline mb-1">
            MODULE 02
          </div>
          <h2 className="text-2xl font-black tracking-tight">Close Position</h2>
        </div>
        <span className="font-technical text-[10px] tracking-widest text-secondary bg-secondary/10 px-3 py-1 rounded-full">
          BASE → SOLANA
        </span>
      </div>
      <div className="space-y-3">
        <ActionCard
          index={4}
          icon="undo"
          title="Bridge USDC back to Solana"
          subtitle="via Mayan (FAST_MCTP) · auto-polls settlement"
          status={statusFor(state, 'BRIDGE_BACK', busy === 'BRIDGE_BACK', stepSigs)}
          busy={busy === 'BRIDGE_BACK'}
          onClick={() => void onBridgeBack()}
          {...(stepSigs.BRIDGE_BACK && { links: explorerLinks(stepSigs.BRIDGE_BACK) })}
        >
          <div className="flex items-center gap-2">
            <span className="font-technical text-[10px] tracking-widest text-outline">AMOUNT</span>
            <input
              type="text"
              value={partial}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setPartial(e.target.value)}
              placeholder="max"
              className="bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1 font-technical text-xs text-on-surface focus:outline-none focus:border-primary-container/60 w-28"
            />
            <span className="font-technical text-[10px] tracking-widest text-on-surface-variant">
              USDC
            </span>
          </div>
        </ActionCard>
        <ActionCard
          index={5}
          icon="payments"
          title="Repay USDC debt"
          subtitle={partial ? `${partial} USDC · partial` : 'Repay full outstanding balance'}
          status={statusFor(state, 'REPAY', busy === 'REPAY', stepSigs)}
          busy={busy === 'REPAY'}
          onClick={() => void onRepay()}
          {...(stepSigs.REPAY && { links: explorerLinks(stepSigs.REPAY) })}
        />
        <ActionCard
          index={6}
          icon="upload"
          title="Withdraw SOL collateral"
          subtitle="Withdraw all remaining SOL collateral"
          status={statusFor(state, 'WITHDRAW', busy === 'WITHDRAW', stepSigs)}
          busy={busy === 'WITHDRAW'}
          onClick={() => void onWithdraw()}
          {...(stepSigs.WITHDRAW && { links: explorerLinks(stepSigs.WITHDRAW) })}
        />
      </div>
      {pendingOrders.length > 0 && (
        <div className="mt-4 font-technical text-[10px] tracking-widest text-on-surface-variant uppercase">
          · PENDING: {pendingOrders.map((o) => o.orderHash.slice(0, 8)).join(', ')}
        </div>
      )}
    </div>
  );
}
