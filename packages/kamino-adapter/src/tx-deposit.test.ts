import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildDepositCollateralTx } from './tx-deposit.js';

const owner = new PublicKey('11111111111111111111111111111111');
const market = { tag: 'market' } as const;
const obligation = { tag: 'oblig' } as const;

function fakeConnection() {
  return { getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: '1'.repeat(44) }) };
}

describe('buildDepositCollateralTx', () => {
  it('throws on zero lamports', async () => {
    await expect(
      buildDepositCollateralTx({
        connection: fakeConnection(),
        kaminoAction: {} as never,
        market,
        obligation,
        owner,
        lamports: 0n,
      }),
    ).rejects.toThrow(/amount must be positive/i);
  });

  it('calls KaminoAction.buildDepositTxns with SOL mint + useV2Ixs + string amount', async () => {
    const action = { id: 'deposit' };
    const buildDepositTxns = vi.fn().mockResolvedValue(action);
    const actionToIxs = vi.fn().mockReturnValue([]);
    const result = await buildDepositCollateralTx({
      connection: fakeConnection(),
      kaminoAction: { buildDepositTxns, actionToIxs },
      market,
      obligation,
      owner,
      lamports: 1_000_000_000n,
    });
    expect(result).toHaveLength(1);
    expect(buildDepositTxns).toHaveBeenCalledOnce();
    const [mkt, amount, mint, ownr, obl, useV2, scope] = buildDepositTxns.mock.calls[0] as [
      unknown,
      string,
      PublicKey,
      PublicKey,
      unknown,
      boolean,
      undefined,
    ];
    expect(mkt).toBe(market);
    expect(amount).toBe('1000000000');
    expect(mint.toBase58()).toBe('So11111111111111111111111111111111111111112');
    expect(ownr).toBe(owner);
    expect(obl).toBe(obligation);
    expect(useV2).toBe(true);
    expect(scope).toBeUndefined();
    expect(actionToIxs).toHaveBeenCalledWith(action);
  });
});
