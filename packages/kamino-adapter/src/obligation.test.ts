import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { getObligation } from './obligation.js';

class FakeVanillaObligation {
  constructor(public readonly programId: PublicKey) {}
}

const programId = new PublicKey('11111111111111111111111111111111');

describe('getObligation', () => {
  it('returns null when obligation not found', async () => {
    const fakeMarket = { programId, getObligationByWallet: vi.fn().mockResolvedValue(null) };
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({
        market: fakeMarket as never,
        owner,
        VanillaObligation: FakeVanillaObligation as never,
      }),
    ).resolves.toBeNull();
  });

  it('returns ObligationView when present', async () => {
    const solMint = 'So11111111111111111111111111111111111111112';
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const fakeObligation = {
      deposits: new Map([[solMint, { amount: 1_000_000_000n }]]),
      borrows: new Map([[usdcMint, { amount: 5_000_000n }]]),
    };
    const fakeMarket = {
      programId,
      getObligationByWallet: vi.fn().mockResolvedValue(fakeObligation),
    };
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({
        market: fakeMarket as never,
        owner,
        VanillaObligation: FakeVanillaObligation as never,
      }),
    ).resolves.toEqual({
      collateralLamports: 1_000_000_000n,
      borrowedUsdcBaseUnits: 5_000_000n,
    });
  });

  it('passes a VanillaObligation built from market.programId', async () => {
    const getObligationByWallet = vi.fn().mockResolvedValue(null);
    const fakeMarket = { programId, getObligationByWallet };
    const owner = new PublicKey('11111111111111111111111111111111');
    await getObligation({
      market: fakeMarket as never,
      owner,
      VanillaObligation: FakeVanillaObligation as never,
    });
    const firstCall = getObligationByWallet.mock.calls[0] as [PublicKey, unknown] | undefined;
    const obligationType = firstCall?.[1];
    expect(obligationType).toBeInstanceOf(FakeVanillaObligation);
    expect((obligationType as FakeVanillaObligation).programId).toBe(programId);
  });
});
