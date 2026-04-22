import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildWithdrawCollateralTx } from './tx-withdraw.js';

const owner = new PublicKey('11111111111111111111111111111111');
const market = { tag: 'market' } as const;
const obligation = { tag: 'oblig' } as const;

function fakeConnection() {
  return { getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: '1'.repeat(44) }) };
}

describe('buildWithdrawCollateralTx', () => {
  it("'all' passes U64_MAX as amount string", async () => {
    const buildWithdrawTxns = vi.fn().mockResolvedValue({});
    const actionToIxs = vi.fn().mockReturnValue([]);
    await buildWithdrawCollateralTx({
      connection: fakeConnection(),
      kaminoAction: { buildWithdrawTxns, actionToIxs },
      market,
      obligation,
      owner,
      lamports: 'all',
    });
    const [, amount] = buildWithdrawTxns.mock.calls[0] as [unknown, string];
    expect(amount).toBe('18446744073709551615');
  });

  it('partial lamports pass bigint as string', async () => {
    const buildWithdrawTxns = vi.fn().mockResolvedValue({});
    const actionToIxs = vi.fn().mockReturnValue([]);
    await buildWithdrawCollateralTx({
      connection: fakeConnection(),
      kaminoAction: { buildWithdrawTxns, actionToIxs },
      market,
      obligation,
      owner,
      lamports: 500_000_000n,
    });
    const [, amount, mint] = buildWithdrawTxns.mock.calls[0] as [unknown, string, PublicKey];
    expect(amount).toBe('500000000');
    expect(mint.toBase58()).toBe('So11111111111111111111111111111111111111112');
  });

  it('rejects non-positive bigint', async () => {
    await expect(
      buildWithdrawCollateralTx({
        connection: fakeConnection(),
        kaminoAction: {} as never,
        market,
        obligation,
        owner,
        lamports: 0n,
      }),
    ).rejects.toThrow(/amount must be positive/i);
  });
});
