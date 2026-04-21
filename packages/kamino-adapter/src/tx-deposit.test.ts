import { describe, it, expect, vi } from 'vitest';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { buildDepositCollateralTx } from './tx-deposit.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildDepositCollateralTx', () => {
  it('throws on zero lamports', async () => {
    await expect(
      buildDepositCollateralTx({ market: {} as never, owner, lamports: 0n }),
    ).rejects.toThrow(/amount must be positive/i);
  });

  it('delegates to KaminoAction.buildDepositTxns and returns txs', async () => {
    const fakeTx = {} as VersionedTransaction;
    const buildDepositTxns = vi.fn().mockResolvedValue([fakeTx]);
    const fakeMarket = { address: owner, buildDepositTxns } as never;
    const result = await buildDepositCollateralTx({
      market: fakeMarket,
      owner,
      lamports: 1_000_000_000n,
    });
    expect(result).toEqual([fakeTx]);
    expect(buildDepositTxns).toHaveBeenCalledOnce();
  });
});
