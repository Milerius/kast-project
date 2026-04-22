import type { PublicKey } from '@solana/web3.js';
import type { ObligationView } from '@kast/shared';

type ReserveLike = {
  address: PublicKey;
};

// Kamino's PubkeyHashMap is keyed by a live PublicKey instance (not a base58
// string) — see klend-sdk/src/utils/pubkey.ts. Match that shape here.
type PubkeyKeyedMap<V> = {
  get(key: PublicKey): V | undefined;
};

type MarketLike = {
  readonly programId: PublicKey;
  getReserveByMint(mint: PublicKey): ReserveLike | null | undefined;
  getObligationByWallet: (
    owner: PublicKey,
    obligationType: unknown,
  ) => Promise<{
    deposits: PubkeyKeyedMap<{ amount: bigint | { toString(): string } }>;
    borrows: PubkeyKeyedMap<{ amount: bigint | { toString(): string } }>;
  } | null>;
};

type VanillaObligationCtor = new (programId: PublicKey) => unknown;

function toBigInt(v: bigint | { toString(): string } | undefined): bigint {
  if (v === undefined) return 0n;
  if (typeof v === 'bigint') return v;
  // klend-sdk returns Decimal.js instances; take the integer part.
  const s = v.toString();
  const dot = s.indexOf('.');
  return BigInt(dot >= 0 ? s.slice(0, dot) : s);
}

export async function getObligation(args: {
  market: MarketLike;
  owner: PublicKey;
  VanillaObligation: VanillaObligationCtor;
  solMintPubkey: PublicKey;
  usdcMintPubkey: PublicKey;
}): Promise<ObligationView | null> {
  const obligationType = new args.VanillaObligation(args.market.programId);
  const obligation = await args.market.getObligationByWallet(args.owner, obligationType);
  if (!obligation) return null;
  // klend-sdk keys these maps by RESERVE address (a live PublicKey instance),
  // not by the liquidity mint and not by a base58 string.
  const solReserve = args.market.getReserveByMint(args.solMintPubkey)?.address;
  const usdcReserve = args.market.getReserveByMint(args.usdcMintPubkey)?.address;
  const sol = solReserve ? toBigInt(obligation.deposits.get(solReserve)?.amount) : 0n;
  const usdc = usdcReserve ? toBigInt(obligation.borrows.get(usdcReserve)?.amount) : 0n;
  return { collateralLamports: sol, borrowedUsdcBaseUnits: usdc };
}
