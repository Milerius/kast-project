import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildRepayTx } from './tx-repay.js';

const owner = new PublicKey('11111111111111111111111111111111');
const market = { tag: 'market' } as const;
const obligation = { tag: 'oblig' } as const;

function fakeConnection() {
  return { getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: '1'.repeat(44) }) };
}

describe('buildRepayTx', () => {
  it("'all' passes U64_MAX as amount string", async () => {
    const buildRepayTxns = vi.fn().mockResolvedValue({});
    const actionToIxs = vi.fn().mockReturnValue([]);
    await buildRepayTx({
      connection: fakeConnection(),
      kaminoAction: { buildRepayTxns, actionToIxs },
      market,
      obligation,
      owner,
      amount: 'all',
      currentSlot: 12_345,
    });
    const [, amount, , , , , , slot] = buildRepayTxns.mock.calls[0] as [
      unknown,
      string,
      PublicKey,
      PublicKey,
      unknown,
      boolean,
      undefined,
      number,
    ];
    expect(amount).toBe('18446744073709551615');
    expect(slot).toBe(12_345);
  });

  it('partial amount passes bigint as string and forwards currentSlot', async () => {
    const buildRepayTxns = vi.fn().mockResolvedValue({});
    const actionToIxs = vi.fn().mockReturnValue([]);
    await buildRepayTx({
      connection: fakeConnection(),
      kaminoAction: { buildRepayTxns, actionToIxs },
      market,
      obligation,
      owner,
      amount: 2_000_000n,
      currentSlot: 99,
    });
    const [, amount, , , , , , slot] = buildRepayTxns.mock.calls[0] as [
      unknown,
      string,
      PublicKey,
      PublicKey,
      unknown,
      boolean,
      undefined,
      number,
    ];
    expect(amount).toBe('2000000');
    expect(slot).toBe(99);
  });

  it('rejects non-positive bigint', async () => {
    await expect(
      buildRepayTx({
        connection: fakeConnection(),
        kaminoAction: {} as never,
        market,
        obligation,
        owner,
        amount: 0n,
        currentSlot: 1,
      }),
    ).rejects.toThrow(/amount must be positive/i);
  });
});
