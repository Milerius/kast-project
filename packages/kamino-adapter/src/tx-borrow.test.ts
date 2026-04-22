import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildBorrowTx } from './tx-borrow.js';

const owner = new PublicKey('11111111111111111111111111111111');
const market = { tag: 'market' } as const;
const obligation = { tag: 'oblig' } as const;

function fakeConnection() {
  return { getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: '1'.repeat(44) }) };
}

describe('buildBorrowTx', () => {
  it('throws on zero amount', async () => {
    await expect(
      buildBorrowTx({
        connection: fakeConnection(),
        kaminoAction: {} as never,
        market,
        obligation,
        owner,
        amountUsdc: 0n,
      }),
    ).rejects.toThrow(/amount must be positive/i);
  });

  it('calls KaminoAction.buildBorrowTxns with USDC mint + useV2Ixs + string amount', async () => {
    const action = { id: 'borrow' };
    const buildBorrowTxns = vi.fn().mockResolvedValue(action);
    const actionToIxs = vi.fn().mockReturnValue([]);
    await buildBorrowTx({
      connection: fakeConnection(),
      kaminoAction: { buildBorrowTxns, actionToIxs },
      market,
      obligation,
      owner,
      amountUsdc: 5_000_000n,
    });
    const [, amount, mint, , , useV2, scope] = buildBorrowTxns.mock.calls[0] as [
      unknown,
      string,
      PublicKey,
      PublicKey,
      unknown,
      boolean,
      undefined,
    ];
    expect(amount).toBe('5000000');
    expect(mint.toBase58()).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(useV2).toBe(true);
    expect(scope).toBeUndefined();
    expect(actionToIxs).toHaveBeenCalledWith(action);
  });
});
