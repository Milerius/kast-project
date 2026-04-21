import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildRepayTx } from './tx-repay.js';

const owner = new PublicKey('11111111111111111111111111111111');

type RepayArg = { amount?: bigint; repayAll?: boolean };

describe('buildRepayTx', () => {
  it("'all' sets repayAll: true on SDK call", async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildRepayTx({ market: { buildRepayTxns: build } as never, owner, amount: 'all' });
    const call = build.mock.calls[0]?.[0] as RepayArg | undefined;
    expect(call?.repayAll).toBe(true);
  });

  it('partial amount passes bigint and repayAll: false', async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildRepayTx({
      market: { buildRepayTxns: build } as never,
      owner,
      amount: 2_000_000n,
    });
    const call = build.mock.calls[0]?.[0] as RepayArg | undefined;
    expect(call?.amount).toBe(2_000_000n);
    expect(call?.repayAll).toBe(false);
  });

  it('rejects non-positive bigint', async () => {
    await expect(buildRepayTx({ market: {} as never, owner, amount: 0n })).rejects.toThrow(
      /amount must be positive/i,
    );
  });
});
