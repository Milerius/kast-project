import type { PublicKey } from '@solana/web3.js';
import { SOLANA_SOL_MINT, SOLANA_USDC_MINT, type ObligationView } from '@kast/shared';

type MarketLike = {
  readonly programId: PublicKey;
  getObligationByWallet: (
    owner: PublicKey,
    obligationType: unknown,
  ) => Promise<{
    deposits: Map<string, { amount: bigint }>;
    borrows: Map<string, { amount: bigint }>;
  } | null>;
};

type VanillaObligationCtor = new (programId: PublicKey) => unknown;

export async function getObligation(args: {
  market: MarketLike;
  owner: PublicKey;
  VanillaObligation: VanillaObligationCtor;
}): Promise<ObligationView | null> {
  const obligationType = new args.VanillaObligation(args.market.programId);
  const obligation = await args.market.getObligationByWallet(args.owner, obligationType);
  if (!obligation) return null;
  const sol = obligation.deposits.get(SOLANA_SOL_MINT)?.amount ?? 0n;
  const usdc = obligation.borrows.get(SOLANA_USDC_MINT)?.amount ?? 0n;
  return { collateralLamports: sol, borrowedUsdcBaseUnits: usdc };
}
