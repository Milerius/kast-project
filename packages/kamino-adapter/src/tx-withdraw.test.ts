import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildWithdrawCollateralTx } from './tx-withdraw.js';

const owner = new PublicKey('11111111111111111111111111111111');

type WithdrawArg = { amount?: bigint; withdrawAll?: boolean };

describe('buildWithdrawCollateralTx', () => {
  it("'all' sets withdrawAll: true", async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildWithdrawCollateralTx({
      market: { buildWithdrawTxns: build } as never,
      owner,
      lamports: 'all',
    });
    const call = build.mock.calls[0]?.[0] as WithdrawArg | undefined;
    expect(call?.withdrawAll).toBe(true);
  });

  it('partial lamports passes bigint', async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildWithdrawCollateralTx({
      market: { buildWithdrawTxns: build } as never,
      owner,
      lamports: 500_000_000n,
    });
    const call = build.mock.calls[0]?.[0] as WithdrawArg | undefined;
    expect(call?.amount).toBe(500_000_000n);
    expect(call?.withdrawAll).toBe(false);
  });
});
