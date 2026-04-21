import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildWithdrawCollateralTx } from './tx-withdraw.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildWithdrawCollateralTx', () => {
  it("'all' sets withdrawAll: true", async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildWithdrawCollateralTx({
      market: { buildWithdrawTxns: build } as never,
      owner,
      lamports: 'all',
    });
    expect(build.mock.calls[0]?.[0]?.withdrawAll).toBe(true);
  });

  it('partial lamports passes bigint', async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildWithdrawCollateralTx({
      market: { buildWithdrawTxns: build } as never,
      owner,
      lamports: 500_000_000n,
    });
    const call = build.mock.calls[0]?.[0];
    expect(call?.amount).toBe(500_000_000n);
    expect(call?.withdrawAll).toBe(false);
  });
});
