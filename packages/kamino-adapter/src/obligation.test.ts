import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { getObligation } from './obligation.js';

class FakeVanillaObligation {
  constructor(public readonly programId: PublicKey) {}
}

const programId = new PublicKey('11111111111111111111111111111111');
const solMintPubkey = new PublicKey('So11111111111111111111111111111111111111112');
const usdcMintPubkey = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const solReserveAddress = new PublicKey('d4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q');
const usdcReserveAddress = new PublicKey('D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59');

type AmountEntry = { amount: bigint | { toString(): string } };

function pubkeyMap(entries: ReadonlyArray<[PublicKey, AmountEntry]>) {
  return {
    get(key: PublicKey): AmountEntry | undefined {
      return entries.find(([k]) => k.equals(key))?.[1];
    },
  };
}

function makeMarket(
  overrides: Partial<{
    programId: PublicKey;
    getReserveByMint: (mint: PublicKey) => { address: PublicKey } | null;
    getObligationByWallet: ReturnType<typeof vi.fn>;
  }>,
) {
  return {
    programId: overrides.programId ?? programId,
    getReserveByMint:
      overrides.getReserveByMint ??
      ((mint: PublicKey) => {
        if (mint.equals(solMintPubkey)) return { address: solReserveAddress };
        if (mint.equals(usdcMintPubkey)) return { address: usdcReserveAddress };
        return null;
      }),
    getObligationByWallet: overrides.getObligationByWallet ?? vi.fn().mockResolvedValue(null),
  };
}

describe('getObligation', () => {
  it('returns null when obligation not found', async () => {
    const fakeMarket = makeMarket({});
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({
        market: fakeMarket as never,
        owner,
        VanillaObligation: FakeVanillaObligation as never,
        solMintPubkey,
        usdcMintPubkey,
      }),
    ).resolves.toBeNull();
  });

  it('returns ObligationView keyed by reserve PublicKey', async () => {
    const fakeObligation = {
      deposits: pubkeyMap([[solReserveAddress, { amount: 1_000_000_000n }]]),
      borrows: pubkeyMap([[usdcReserveAddress, { amount: 5_000_000n }]]),
    };
    const fakeMarket = makeMarket({
      getObligationByWallet: vi.fn().mockResolvedValue(fakeObligation),
    });
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({
        market: fakeMarket as never,
        owner,
        VanillaObligation: FakeVanillaObligation as never,
        solMintPubkey,
        usdcMintPubkey,
      }),
    ).resolves.toEqual({
      collateralLamports: 1_000_000_000n,
      borrowedUsdcBaseUnits: 5_000_000n,
    });
  });

  it('handles Decimal.js-like amounts with fractional parts', async () => {
    const fakeObligation = {
      deposits: pubkeyMap([[solReserveAddress, { amount: { toString: () => '236123456.789' } }]]),
      borrows: pubkeyMap([[usdcReserveAddress, { amount: { toString: () => '4999876.54321' } }]]),
    };
    const fakeMarket = makeMarket({
      getObligationByWallet: vi.fn().mockResolvedValue(fakeObligation),
    });
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({
        market: fakeMarket as never,
        owner,
        VanillaObligation: FakeVanillaObligation as never,
        solMintPubkey,
        usdcMintPubkey,
      }),
    ).resolves.toEqual({
      collateralLamports: 236_123_456n,
      borrowedUsdcBaseUnits: 4_999_876n,
    });
  });

  it('returns zeros when reserves are not found', async () => {
    const fakeObligation = {
      deposits: pubkeyMap([[solReserveAddress, { amount: 42n }]]),
      borrows: pubkeyMap([[usdcReserveAddress, { amount: 99n }]]),
    };
    const fakeMarket = makeMarket({
      getReserveByMint: () => null,
      getObligationByWallet: vi.fn().mockResolvedValue(fakeObligation),
    });
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({
        market: fakeMarket as never,
        owner,
        VanillaObligation: FakeVanillaObligation as never,
        solMintPubkey,
        usdcMintPubkey,
      }),
    ).resolves.toEqual({
      collateralLamports: 0n,
      borrowedUsdcBaseUnits: 0n,
    });
  });

  it('passes a VanillaObligation built from market.programId', async () => {
    const getObligationByWallet = vi.fn().mockResolvedValue(null);
    const fakeMarket = makeMarket({ getObligationByWallet });
    const owner = new PublicKey('11111111111111111111111111111111');
    await getObligation({
      market: fakeMarket as never,
      owner,
      VanillaObligation: FakeVanillaObligation as never,
      solMintPubkey,
      usdcMintPubkey,
    });
    const firstCall = getObligationByWallet.mock.calls[0] as [PublicKey, unknown] | undefined;
    const obligationType = firstCall?.[1];
    expect(obligationType).toBeInstanceOf(FakeVanillaObligation);
    expect((obligationType as FakeVanillaObligation).programId).toBe(programId);
  });
});
