import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';

const { loadSpy, getObligationSpy, depositSpy, borrowSpy, repaySpy, withdrawSpy } = vi.hoisted(
  () => ({
    loadSpy: vi.fn(),
    getObligationSpy: vi.fn(),
    depositSpy: vi.fn(),
    borrowSpy: vi.fn(),
    repaySpy: vi.fn(),
    withdrawSpy: vi.fn(),
  }),
);

vi.mock('@kamino-finance/klend-sdk', () => ({
  KaminoMarket: { load: loadSpy },
  VanillaObligation: class FakeVanillaObligation {
    constructor(public readonly programId: unknown) {}
  },
}));

vi.mock('./obligation.js', () => ({ getObligation: getObligationSpy }));
vi.mock('./tx-deposit.js', () => ({ buildDepositCollateralTx: depositSpy }));
vi.mock('./tx-borrow.js', () => ({ buildBorrowTx: borrowSpy }));
vi.mock('./tx-repay.js', () => ({ buildRepayTx: repaySpy }));
vi.mock('./tx-withdraw.js', () => ({ buildWithdrawCollateralTx: withdrawSpy }));

import { createKaminoAdapter } from './adapter.js';

const connection = new Connection('http://localhost:8899');
const marketAddress = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');
const owner = new PublicKey('11111111111111111111111111111111');

describe('createKaminoAdapter', () => {
  beforeEach(() => {
    loadSpy.mockReset();
    getObligationSpy.mockReset();
    depositSpy.mockReset();
    borrowSpy.mockReset();
    repaySpy.mockReset();
    withdrawSpy.mockReset();
  });

  it('loads the market once and forwards every call to the matching impl', async () => {
    const fakeMarket = { programId: owner };
    loadSpy.mockResolvedValue(fakeMarket);
    getObligationSpy.mockResolvedValue(null);
    depositSpy.mockResolvedValue(['deposit-tx']);
    borrowSpy.mockResolvedValue(['borrow-tx']);
    repaySpy.mockResolvedValue(['repay-tx']);
    withdrawSpy.mockResolvedValue(['withdraw-tx']);

    const adapter = createKaminoAdapter({ connection, marketAddress });

    const obl = await adapter.getObligation(owner);
    const dep = await adapter.buildDepositCollateralTx({ owner, lamports: 1_000_000_000n });
    const bor = await adapter.buildBorrowTx({ owner, amountUsdc: 5_000_000n });
    const rep = await adapter.buildRepayTx({ owner, amount: 'all' });
    const wit = await adapter.buildWithdrawCollateralTx({ owner, lamports: 'all' });

    expect(obl).toBeNull();
    expect(dep).toEqual(['deposit-tx']);
    expect(bor).toEqual(['borrow-tx']);
    expect(rep).toEqual(['repay-tx']);
    expect(wit).toEqual(['withdraw-tx']);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(getObligationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ market: fakeMarket, owner }),
    );
    expect(depositSpy).toHaveBeenCalledWith(
      expect.objectContaining({ market: fakeMarket, owner, lamports: 1_000_000_000n }),
    );
    expect(borrowSpy).toHaveBeenCalledWith(
      expect.objectContaining({ market: fakeMarket, owner, amountUsdc: 5_000_000n }),
    );
    expect(repaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ market: fakeMarket, owner, amount: 'all' }),
    );
    expect(withdrawSpy).toHaveBeenCalledWith(
      expect.objectContaining({ market: fakeMarket, owner, lamports: 'all' }),
    );
  });
});
