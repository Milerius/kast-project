import { describe, it, expect, vi } from 'vitest';
import type { VersionedTransaction } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { buildBorrowTx } from './tx-borrow.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildBorrowTx', () => {
  it('throws on zero amount', async () => {
    await expect(buildBorrowTx({ market: {} as never, owner, amountUsdc: 0n })).rejects.toThrow(
      /amount must be positive/i,
    );
  });

  it('delegates to market.buildBorrowTxns with USDC mint', async () => {
    const fakeTx = {} as VersionedTransaction;
    const buildBorrowTxns = vi.fn().mockResolvedValue([fakeTx]);
    const fakeMarket = { buildBorrowTxns } as never;
    const result = await buildBorrowTx({ market: fakeMarket, owner, amountUsdc: 5_000_000n });
    expect(result).toEqual([fakeTx]);
    const [arg] = (buildBorrowTxns.mock.calls[0] ?? []) as [
      { mint: string; amount: bigint } | undefined,
    ];
    expect(arg?.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(arg?.amount).toBe(5_000_000n);
  });
});
